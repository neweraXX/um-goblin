import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assessAnswer, buildFfmpegFilter, countFillers, extractWords, perHundred, transcriptFrom } from './lib/analysis.mjs';
import { alignChangedWords, buildCleanPlan, buildCleanSummary } from './lib/clean.mjs';
import { fallbackCoach, stubCoach, validateCoach } from './lib/coach.mjs';
import { buildHabitCandidates, fillerContexts } from './lib/habits.mjs';
import { loadManifest } from './lib/manifest.mjs';
import { createRateLimiter, requestIp } from './lib/rate-limit.mjs';
import { filterSessionAttempts, mayReadAttemptAudio } from './lib/privacy.mjs';
import audioTypes from './public/take.js';
import { normalizeWord } from './lib/normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(os.homedir(), 'goblin-data');
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.env.MOCK === '1';
const MAX_BYTES = 8 * 1024 * 1024;
const samples = await loadManifest(path.join(ROOT, 'samples/manifest.json'));
const rateLimiter = createRateLimiter({ perIp: Number(process.env.RATE_PER_IP || 20), globalPerDay: Number(process.env.RATE_PER_DAY || 300) });
const processStartedAt = new Date().toISOString();
const cleanRunning = new Set();
const sampleRunning = new Map();
const cleanPending = new Map();
const publicResult = ({ sessionId: _session, publicSample: _public, ...result }) => result;
function allowRequest(req, res) {
  const limit = rateLimiter.consume(requestIp(req));
  if (!limit.allowed) json(res, 429, { error: limit.message });
  return limit.allowed;
}

const json = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
const safeId = (id) => /^[a-z0-9_-]+$/i.test(id);

async function history() {
  await mkdir(DATA, { recursive: true });
  const items = [];
  for (const id of await readdir(DATA)) {
    if (!safeId(id)) continue;
    try { items.push(JSON.parse(await readFile(path.join(DATA, id, 'attempt.json'), 'utf8'))); } catch {}
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function getSessionId(req, res) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [key, value.join('=')];
  }).filter(([key]) => key));
  if (/^[a-f0-9]{64}$/.test(cookies.umg_session || '')) return cookies.umg_session;
  const sessionId = randomBytes(32).toString('hex');
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('set-cookie', `umg_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/${secure}`);
  return sessionId;
}

async function visitSnapshot(sessionId, markVisit) {
  const sessionDirectory = path.join(DATA, 'sessions');
  const file = path.join(sessionDirectory, `${sessionId}.json`);
  let lastRequestAt = null;
  try { lastRequestAt = JSON.parse(await readFile(file, 'utf8')).lastRequestAt || null; } catch {}
  const now = new Date();
  if (markVisit) {
    await mkdir(sessionDirectory, { recursive: true });
    await writeFile(file, JSON.stringify({ lastRequestAt: now.toISOString() }));
  }
  return {
    processStartedAt,
    lastRequestAt,
    serverUptimeSeconds: Math.max(0, Math.floor((now.getTime() - Date.parse(processStartedAt)) / 1000)),
    previousVisitSecondsAgo: lastRequestAt ? Math.max(0, Math.floor((now.getTime() - Date.parse(lastRequestAt)) / 1000)) : null,
  };
}

async function runFfmpeg(input, fillerWords, output) {
  if (!fillerWords.length) return false;
  const graph = buildFfmpegFilter(fillerWords);
  return await new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-y', '-i', input, '-filter_complex', graph, '-map', '[out]', '-codec:a', 'libmp3lame', output], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

async function deepgram(audio, sampleId, contentType) {
  if (MOCK) {
    if (!sampleId && contentType?.includes('wav') && audio.subarray(0, 4).toString() === 'RIFF' && audio.subarray(44).every((sample) => sample === 0)) {
      return { metadata: { duration: 3 }, results: { channels: [{ alternatives: [{ transcript: '', words: [] }] }] } };
    }
    return JSON.parse(await readFile(path.join(ROOT, 'fixtures', `${sampleId || 'spacewalk'}.deepgram.json`), 'utf8'));
  }
  const base = process.env.DG_BASE || 'https://api.sprites.dev/v1/gateway/deepgram/eNpa5SKIon_1VgCUfzbNHQ';
  const url = new URL(`${base.replace(/\/$/, '')}/v1/listen?model=nova-3&filler_words=true&punctuate=true`);
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': contentType || 'audio/webm' }, body: audio, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Speech service returned ${response.status}: ${(await response.text()).slice(0, 240)}`);
  return response.json();
}

async function coach(question, words, previous) {
  const candidates = buildHabitCandidates(words);
  const contexts = fillerContexts(words);
  const transcript = words.map((word) => word.text).join(' ').split(/\s+/).slice(0, 300).join(' ');
  if (MOCK) return { value: stubCoach(words, words.filter((word) => !word.filler).length >= 15, candidates), source: 'mock', elapsedMs: 0 };
  const base = process.env.OR_BASE || 'https://api.sprites.dev/v1/gateway/openrouter/pBZuIhRH7y-Dxhg7khei6Q';
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(`${base.replace(/\/$/, '')}/v1/chat/completions`), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: process.env.OR_MODEL || 'openai/gpt-4o-mini', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: `You are a cheeky goblin speaking coach. Pick habit_id from the supplied habit candidates and restate its pattern naturally and specifically in habit. Use evidence indexes only from the supplied filler list. Give exactly one next-take action as an imperative verb, tied to that habit, in drill (max 25 words). goblin_line is the hungry goblin talking about being fed or starved of “um”; make it funny and keep it under 15 words. Judge whether the answer covers the question; do not reward silence or fewer than 15 non-filler words. Return JSON only with habit, habit_id, evidence, drill, covered_points, verdict (fed|starving|not_a_win), goblin_line.\n\nExample input candidate: {"id":"after_transition","label":"after a transition word","count":2,"fillerIndexes":[8,21]}. Example output: {"habit":"You slip an “um” right after a transition word.","habit_id":"after_transition","evidence":[8,21],"drill":"Pause after “and,” “so,” or “but” before adding the next thought.","covered_points":true,"verdict":"fed","goblin_line":"Those ums were delicious; my goblin belly demands seconds!"}` },
        { role: 'user', content: JSON.stringify({ question, transcript, fillers: contexts, candidates, previous: previous.map((attempt) => ({ question: attempt.question, fillers: attempt.fillers, verdict: attempt.verdict })) }) },
      ] }),
    });
    if (!response.ok) throw new Error(`Coach returned ${response.status}`);
    const body = await response.json();
    const fillerIndexes = contexts.map((item) => item.index);
    const candidateIds = candidates.map((candidate) => candidate.id);
    const value = validateCoach(body.choices?.[0]?.message?.content, { fillerIndexes, candidateIds });
    if (!value) throw new Error('Coach returned invalid JSON');
    return { value, source: 'connector', elapsedMs: Math.round(performance.now() - startedAt) };
  } catch { return { value: fallbackCoach(words, words.filter((word) => !word.filler).length >= 15, candidates), source: 'fallback', elapsedMs: Math.round(performance.now() - startedAt) }; }
}

async function handleAnalyze(req, res, url, sessionId) {
  const sampleId = url.searchParams.get('sample');
  const sample = samples.find((item) => item.id === sampleId);
  if (sampleId && !sample) return json(res, 404, { error: 'Sample not found.' });
  if (sample) {
    const cached = (await history()).find((attempt) => attempt.publicSample && attempt.sampleId === sampleId && (attempt.coach === 'mock') === MOCK);
    if (cached) return json(res, 200, publicResult(cached));
  } else {
    if (!/^audio\//i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'Choose an audio file to continue.' });
    if (!allowRequest(req, res)) return;
  }
  let audio;
  if (sampleId) audio = await readFile(path.resolve(ROOT, 'samples', sample.file));
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) return json(res, 413, { error: 'Audio must be 8 MB or smaller.' }); chunks.push(chunk); }
    audio = Buffer.concat(chunks);
    if (!audio.length) return json(res, 400, { error: 'Choose a clip or record an answer first.' });
  }
  const question = url.searchParams.get('question') || sample?.question || 'Tell me about a difficult situation at work.';
  const contentType = sample ? audioTypes.audioMime(sample.file) : req.headers['content-type'] || '';
  try {
    const deepgramStartedAt = performance.now();
    const dg = await deepgram(audio, sampleId, contentType);
    const deepgramMs = Math.round(performance.now() - deepgramStartedAt);
    const duration = Number(dg?.metadata?.duration);
    if (Number.isFinite(duration) && duration > 95) return json(res, 413, { error: 'This take is over 95 seconds. Trim it and try again.' });
    const words = transcriptFrom(dg);
    const earlier = filterSessionAttempts(await history(), sessionId).filter((attempt) => attempt.question === question);
    const spokenCount = words.filter((word) => word.word !== 'um' && word.word !== 'uh').length;
    const candidates = buildHabitCandidates(words);
    const estimatedCovered = spokenCount >= 15;
    const fillers = countFillers(words);
    const coached = spokenCount < 15 || fillers === 0
      ? { value: fallbackCoach(words, estimatedCovered, candidates), source: 'fallback', elapsedMs: 0 }
      : await coach(question, words, earlier);
    const assessment = assessAnswer(words, coached.value.covered_points);
    const verdict = assessment.verdict;
    const attemptId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(DATA, attemptId);
    await mkdir(dir, { recursive: true });
    const ext = sample?.file ? path.extname(sample.file) : audioTypes.audioExtension(contentType);
    const audioName = `answer${ext}`;
    await writeFile(path.join(dir, audioName), audio);
    await writeFile(path.join(dir, 'deepgram.json'), JSON.stringify(dg));
    const goblinAudio = await runFfmpeg(path.join(dir, audioName), words.filter((word) => word.filler), path.join(dir, 'goblin.mp3'));
    const coveredBasis = coached.source === 'connector' ? 'coach' : 'estimated (no coach)';
    const result = {
      id: attemptId, createdAt: new Date().toISOString(), question, sampleId: sample?.id || null,
      words, transcript: words, fillers, per100: perHundred(words), covered: assessment.covered,
      coveredBasis, spokenWords: assessment.spoken, verdict, coach: coached.source,
      advice: { ...coached.value, covered_points: assessment.covered, verdict },
      timings: { deepgramMs, coachMs: coached.elapsedMs, deepgramLabel: MOCK ? 'Deepgram fixture' : 'Deepgram connector', coachLabel: coached.source === 'fallback' ? 'fallback' : MOCK ? 'mock coach' : 'OpenRouter connector' },
      audioUrl: `/api/audio/${attemptId}/${audioName}`, goblinAudioUrl: goblinAudio ? `/api/audio/${attemptId}/goblin.mp3` : null,
      goblinAudioAvailable: goblinAudio, durationSeconds: duration,
    };
    await writeFile(path.join(dir, 'attempt.json'), JSON.stringify({ ...result, sessionId, publicSample: Boolean(sample) }, null, 2));
    return json(res, 200, result);
  } catch (error) { return json(res, 502, { error: `Could not analyze this take: ${error.message}` }); }
}

async function runCleanFfmpeg(input, output, filtergraph) {
  return await new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-filter_complex', filtergraph, '-map', '[out]', '-c:a', 'pcm_s16le', output], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

async function handleClean(req, res, attemptId, sessionId) {
  if (!safeId(attemptId)) return json(res, 404, { error: 'Take not found.' });
  const dir = path.join(DATA, attemptId);
  let attempt;
  try { attempt = JSON.parse(await readFile(path.join(dir, 'attempt.json'), 'utf8')); } catch { return json(res, 404, { error: 'Take not found.' }); }
  if (attempt.sessionId !== sessionId && !attempt.publicSample) return json(res, 404, { error: 'Take not found.' });
  if (attempt.clean) {
    if (attempt.clean.contentWordsBefore == null || attempt.clean.contentWordsAfter == null || attempt.clean.removedSeconds == null || !Array.isArray(attempt.clean.changedWords)) {
      const originalWords = attempt.words || attempt.transcript || [];
      const finalPass = attempt.clean.passes?.at(-1);
      const cachedAfterWords = (attempt.clean.transcriptAfter || '').split(/\s+/).filter(Boolean).map((text) => {
        const word = normalizeWord(text);
        return { word, text, filler: word === 'um' || word === 'uh' };
      });
      Object.assign(attempt.clean, buildCleanSummary(
        originalWords,
        typeof attempt.clean.transcriptAfter === 'string' ? cachedAfterWords : originalWords,
        attempt.durationSeconds || attempt.clean.passes?.[0]?.duration || 0,
        finalPass?.duration || attempt.durationSeconds || 0,
      ));
      if (!Array.isArray(attempt.clean.changedWords)) attempt.clean.changedWords = alignChangedWords(originalWords, typeof attempt.clean.transcriptAfter === 'string' ? cachedAfterWords : originalWords);
      await writeFile(path.join(dir, 'attempt.json'), JSON.stringify(attempt, null, 2));
    }
    return json(res, 200, attempt.clean);
  }
  if (cleanRunning.has(attemptId)) return json(res, 409, { error: 'The goblin is already editing this take. Please try again in a moment.' });
  if (!attempt.publicSample && !allowRequest(req, res)) return;
  cleanRunning.add(attemptId);

  try {
    const dg = JSON.parse(await readFile(path.join(dir, 'deepgram.json'), 'utf8'));
    const words = transcriptFrom(dg);
    const duration = Number(dg?.metadata?.duration);
    if (!Number.isFinite(duration) || duration <= 0) return json(res, 422, { error: 'The original recording has no usable duration.' });
    const originalFillers = countFillers(words);
    const passes = [{ pass: 0, fillers: originalFillers, words: words.length, duration }];
    const transcriptAfterText = (items) => items.map((word) => word.text).join(' ').trim();
    let finalWords = words;
    let cleanAudioUrl = attempt.audioUrl;
    let outputFile = null;

    if (MOCK && originalFillers > 0) {
      const plan = buildCleanPlan(words, duration);
      const firstFillers = Math.min(1, originalFillers);
      const estimates = originalFillers > 1 ? [firstFillers, 0] : [0];
      for (const [index, remaining] of estimates.entries()) {
        const pass = index + 1;
        passes.push({
          pass, fillers: remaining, words: Math.max(0, words.length - (originalFillers - remaining)),
          duration: Number((pass === 1 ? (duration + plan.duration) / 2 : plan.duration).toFixed(2)), mock: true,
        });
      }
      finalWords = words.filter((word) => !word.filler);
      cleanAudioUrl = null;
    } else if (originalFillers > 0) {
      let currentDg = dg;
      let currentWords = words;
      let currentDuration = duration;
      const originalName = attempt.audioUrl.split('/').at(-1);
      let currentInput = path.join(dir, originalName);
      for (let pass = 1; pass <= 3 && countFillers(currentWords) > 0; pass++) {
        const plan = buildCleanPlan(currentWords, currentDuration);
        const nextName = `clean-pass-${pass}.wav`;
        const nextOutput = path.join(dir, nextName);
        if (!await runCleanFfmpeg(currentInput, nextOutput, plan.filtergraph)) {
          return json(res, 503, { error: 'The goblin editor needs ffmpeg on this Sprite. Your original take is safe.' });
        }
        const cleanedAudio = await readFile(nextOutput);
        currentDg = await deepgram(cleanedAudio, null, 'audio/wav');
        currentWords = transcriptFrom(currentDg);
        currentDuration = Number(currentDg?.metadata?.duration ?? plan.duration);
        await writeFile(path.join(dir, `clean-deepgram-${pass}.json`), JSON.stringify(currentDg));
        passes.push({ pass, fillers: countFillers(currentWords), words: currentWords.length, duration: currentDuration });
        currentInput = nextOutput;
        outputFile = nextName;
      }
      finalWords = currentWords;
      cleanAudioUrl = outputFile ? `/api/audio/${attemptId}/${outputFile}` : attempt.audioUrl;
    }

    const cleanResult = {
      attemptId, passes, cleanAudioUrl, transcriptAfter: transcriptAfterText(finalWords),
      ...buildCleanSummary(words, finalWords, duration, passes.at(-1)?.duration ?? duration),
      changedWords: alignChangedWords(words, finalWords),
      mock: MOCK, label: MOCK ? 'MOCK · simulated clean statistics; no edited audio was generated' : 'LIVE · each pass was re-checked by Deepgram',
    };
    attempt.clean = cleanResult;
    await writeFile(path.join(dir, 'attempt.json'), JSON.stringify(attempt, null, 2));
    return json(res, 200, cleanResult);
  } catch (error) { return json(res, 502, { error: `Could not edit this take: ${error.message}` }); }
  finally { cleanRunning.delete(attemptId); }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const sessionId = getSessionId(req, res);
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, mock: MOCK });
  if (req.method === 'GET' && url.pathname === '/api/samples') return json(res, 200, samples);
  if (req.method === 'GET' && url.pathname === '/api/history') {
    const all = await history();
    const mine = filterSessionAttempts(all, sessionId).map(({ sessionId: _privateSession, publicSample: _public, ...attempt }) => attempt);
    const visit = await visitSnapshot(sessionId, url.searchParams.get('visit') === '1');
    return json(res, 200, { attempts: mine, count: mine.length, globalCount: all.length, dataPath: DATA, ...visit });
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const sampleId = url.searchParams.get('sample');
    if (!sampleId) return handleAnalyze(req, res, url, sessionId);
    // Serialize the first public sample creation as well as subsequent cache reads.
    if (sampleRunning.has(sampleId)) await sampleRunning.get(sampleId);
    const pending = handleAnalyze(req, res, url, sessionId);
    sampleRunning.set(sampleId, pending);
    try { return await pending; } finally { if (sampleRunning.get(sampleId) === pending) sampleRunning.delete(sampleId); }
  }
  const cleanMatch = url.pathname.match(/^\/api\/attempts\/([\w-]+)\/clean$/);
  if (req.method === 'POST' && cleanMatch) {
    const id = cleanMatch[1];
    if (cleanPending.has(id)) await cleanPending.get(id);
    const pending = handleClean(req, res, id, sessionId);
    cleanPending.set(id, pending);
    try { return await pending; } finally { if (cleanPending.get(id) === pending) cleanPending.delete(id); }
  }
  if (req.method === 'POST' && url.pathname === '/api/gate-test') {
    if (!allowRequest(req, res)) return;
    if (MOCK) return json(res, 200, { ok: false, error: 'Mock mode: the deliberately bogus connection was not sent to the network. Set MOCK=0 on a Sprite to see the real gateway rejection.' });
    try {
      const base = (process.env.DG_BASE || 'https://api.sprites.dev/v1/gateway/deepgram/eNpa5SKIon_1VgCUfzbNHQ').replace(/\/$/, '').replace(/\/[^/]+$/, '');
      const response = await fetch(`${base}/definitely-not-a-real-connection/v1/listen?model=nova-3`, { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: Buffer.from('not-audio'), signal: AbortSignal.timeout(15000) });
      const detail = (await response.text()).slice(0, 500);
      return json(res, 200, { ok: false, status: response.status, error: detail || 'Connector rejected the unknown connection.' });
    } catch (error) { return json(res, 200, { ok: false, error: error.message }); }
  }
  const audioMatch = url.pathname.match(/^\/api\/audio\/([\w-]+)\/([\w.-]+)$/);
  if (req.method === 'GET' && audioMatch && safeId(audioMatch[1]) && !audioMatch[2].includes('..')) {
    try {
      const attempt = JSON.parse(await readFile(path.join(DATA, audioMatch[1], 'attempt.json'), 'utf8'));
      if (!mayReadAttemptAudio(attempt, sessionId, audioMatch[2])) return json(res, 404, { error: 'Audio not found.' });
      const file = path.join(DATA, audioMatch[1], audioMatch[2]);
      const info = await stat(file);
      const contentTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac' };
      res.writeHead(200, { 'content-length': info.size, 'content-type': contentTypes[path.extname(audioMatch[2]).toLowerCase()] });
      return createReadStream(file).pipe(res);
    } catch { return json(res, 404, { error: 'Audio not found.' }); }
  }
  if (req.method === 'GET') {
    if (url.pathname.startsWith('/samples/')) {
      const name = url.pathname.slice('/samples/'.length);
      const extension = path.extname(name).toLowerCase();
      const contentTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.aac': 'audio/aac' };
      if (!/^[\w.-]+$/.test(name) || name.includes('..')) return json(res, 403, { error: 'Forbidden' });
      if (!contentTypes[extension]) return json(res, 404, { error: 'Sample audio not found.' });
      try { const file = await readFile(path.resolve(ROOT, 'samples', name)); res.writeHead(200, { 'content-type': contentTypes[extension] }); return res.end(file); } catch { return json(res, 404, { error: 'Not found.' }); }
    }
    if (url.pathname === '/README.md') {
      try { const body = await readFile(path.join(ROOT, 'README.md')); res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' }); return res.end(body); } catch { return json(res, 404, { error: 'README not found.' }); }
    }
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, 'public', relative);
    if (!file.startsWith(path.resolve(ROOT, 'public') + path.sep) && file !== path.resolve(ROOT, 'public', 'index.html')) return json(res, 403, { error: 'Forbidden' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); return res.end(body); } catch { return json(res, 404, { error: 'Not found.' }); }
  }
  return json(res, 404, { error: 'Not found.' });
}

const server = http.createServer((req, res) => { handle(req, res).catch((error) => json(res, 500, { error: error.message })); });
server.listen(PORT, '0.0.0.0', () => console.log(`Um Goblin listening on ${PORT} (${MOCK ? 'mock' : 'live'})`));
