import './goblin.js';
import { findStoryPair, safeComparison } from './story.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { samples: [], currentMode: 'story', results: [], recorder: null, chunks: [], started: 0, timer: null, stream: null, sampleAudio: null, controllers: new Set(), uiToken: 0, nextQuestion: 'Tell me about a difficult situation at work.', previousVisitAt: undefined };
const showToast = (message) => { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400); };

async function request(url, options) {
  const controller = options?.signal ? null : new AbortController();
  if (controller) state.controllers.add(controller);
  try {
    const signal = options?.signal || controller.signal;
    const response = await fetch(url, { ...options, signal });
    const body = await response.json().catch((error) => { if (signal.aborted) throw error; return {}; });
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  } finally { if (controller) state.controllers.delete(controller); }
}

const wasAborted = (error) => error?.name === 'AbortError';

function setMode(mode) {
  state.currentMode = mode;
  $$('.entrance').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $$('.mode-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== mode));
  if (mode !== 'judge') $('#results').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showStorySample(sample) {
  $('#speaker').textContent = sample.speaker;
  $('#source').textContent = sample.source;
  $('#story-question').textContent = sample.question;
  $('#story-situation').textContent = sample.situation || sample.source;
  $('#quote').textContent = sample.quote || sample.title;
  $('#hear-sample').dataset.sample = sample.id;
  document.querySelector('.take-number').textContent = `TAKE · ${sample.role || 'STORY'}`;
}

function storyPair(sample) { return findStoryPair(state.samples, sample); }

function setLoading(button, loading, label) {
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = loading;
  button.classList.toggle('loading', loading);
  button.innerHTML = loading ? '◌ &nbsp; Goblin is listening…' : (label || button.dataset.label);
}

async function analyzeSample(sample, button) {
  setLoading(button, true);
  try { return await request(`/api/analyze?sample=${encodeURIComponent(sample.id)}&question=${encodeURIComponent(sample.question)}`, { method: 'POST' }); }
  finally { setLoading(button, false); }
}

async function playStory() {
  const sample = state.samples[0];
  if (!sample) return showToast('No story sample is available yet.');
  const button = $('#play-story');
  const pair = storyPair(sample);
  const token = state.uiToken;
  try {
    const first = pair?.before || sample;
    showStorySample(first);
    state.nextQuestion = first.question;
    $('#practice-question').textContent = first.question;
    const result = await analyzeSample(first, button);
    if (token !== state.uiToken) return;
    state.results.push(result);
    renderResult(result, state.results.at(-2));
    setTakeTwo(result, pair);
    await refreshHistory(false, token);
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await playGoblinAudio();
    if (token === state.uiToken) await runGoblinEdit(result, false, token);
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) showToast(error.message); }
}

function setTakeTwo(result, pair = storyPair(state.samples.find((item) => item.id === result.sampleId))) {
  const button = $('#next-take');
  if (pair && result.sampleId === pair.before.id && !state.results.some((take) => take.sampleId === pair.after.id)) {
    button.dataset.sample = pair.after.id;
    button.dataset.before = pair.before.id;
    button.innerHTML = 'Take 2 <span>→</span>';
  } else {
    delete button.dataset.sample;
    delete button.dataset.before;
    button.innerHTML = 'Next take <span>→</span>';
  }
}

async function playGoblinAudio() {
  const audio = $('#goblin-audio');
  if (!audio.src || $('#goblin-player').classList.contains('hidden')) return;
  try { await audio.play(); } catch { /* Browser autoplay policy can require the visible play button. */ }
}

function formatSeconds(value) { return `${Number(value || 0).toFixed(1)}s`; }

async function runGoblinEdit(result, autoPlay = false, token = state.uiToken) {
  const button = $('#clean-action');
  const audio = $('#clean-audio');
  const panel = $('#clean-panel');
  panel.classList.remove('hidden');
  $('#original-audio').src = result.audioUrl;
  $('#clean-status').textContent = 'The goblin is trimming the ums, then asking Deepgram to listen again…';
  setLoading(button, true, '♫ &nbsp; Editing…');
  try {
    const clean = await request(`/api/attempts/${encodeURIComponent(result.id)}/clean`, { method: 'POST' });
    if (token !== state.uiToken) return;
    const first = clean.passes[0];
    const final = clean.passes.at(-1);
    $('#clean-label').textContent = clean.mock ? 'MOCK · SIMULATED STATS' : 'LIVE · DEEPGRAM RE-CHECK';
    $('#clean-passes').textContent = clean.passes.map((pass) => `Pass ${pass.pass}: ${pass.fillers} fillers · ${pass.words} words · ${formatSeconds(pass.duration)}${pass.mock ? ' · mock' : ''}`).join('   →   ');
    $('#clean-comparison').textContent = `${first.fillers} → ${final.fillers} fillers · ${result.per100} → ${ratePerHundred(final)} / 100 · ${formatSeconds(first.duration)} → ${formatSeconds(final.duration)}`;
    $('#clean-transcript').textContent = `After the edit: ${clean.transcriptAfter || '(no words recognized)'}`;
    $('#clean-measure').textContent = `${clean.passes.map((pass) => pass.fillers).join(' → ')} fillers · final ${formatSeconds(final.duration)}`;
    $('#clean-measure-tag').textContent = clean.mock ? 'MOCK' : 'REAL · LIVE';
    $('#clean-measure-tag').className = `tag ${clean.mock ? 'target' : 'real'}`;
    if (clean.cleanAudioUrl) {
      audio.src = clean.cleanAudioUrl;
      audio.classList.remove('hidden');
      audio.disabled = false;
      $('#clean-audio-note').classList.add('hidden');
    } else {
      audio.pause(); audio.removeAttribute('src'); audio.load(); audio.disabled = true; audio.classList.remove('hidden');
      $('#clean-audio-note').classList.remove('hidden');
    }
    audio.onplay = () => setGoblinPlaying(true);
    audio.onended = audio.onpause = () => setGoblinPlaying(false);
    $('#clean-status').textContent = clean.label;
    $('#now-you-try').classList.remove('hidden');
    await refreshHistory(false, token);
    if (autoPlay && clean.cleanAudioUrl) {
      $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { await audio.play(); } catch { /* The player remains available if autoplay is blocked. */ }
    }
    return clean;
  } catch (error) {
    if (!wasAborted(error) && token === state.uiToken) {
      $('#clean-status').textContent = error.message;
      $('#now-you-try').classList.remove('hidden');
    }
    return null;
  } finally {
    setLoading(button, false, '♫ &nbsp; Hear yourself without the ums');
  }
}

function ratePerHundred(pass) {
  const nonFillers = Math.max(0, Number(pass.words) - Number(pass.fillers));
  return nonFillers ? Math.round(Number(pass.fillers) / nonFillers * 1000) / 10 : 0;
}

function setGoblinPlaying(playing) {
  document.querySelectorAll('um-goblin').forEach((goblin) => playing ? goblin.setAttribute('playing', '') : goblin.removeAttribute('playing'));
}

async function refreshHistory(markVisit = false, token = state.uiToken) {
  try {
    const facts = await request(`/api/history${markVisit ? '?visit=1' : ''}`);
    if (token !== state.uiToken) return;
    $('#history-count').textContent = facts.count;
    $('#global-history-count').textContent = facts.globalCount;
    $('#data-path').textContent = facts.dataPath;
    if (markVisit || state.previousVisitAt === undefined) state.previousVisitAt = facts.lastRequestAt;
    const previousAge = state.previousVisitAt ? Math.max(0, Math.floor((Date.now() - Date.parse(state.previousVisitAt)) / 1000)) : null;
    const previous = previousAge === null ? 'no previous visit recorded' : `${previousAge}s ago`;
    $('#sleep-time').textContent = `This Sprite woke up ${facts.wokeSecondsAgo}s ago on your request; previous visit ${previous}`;
    const timings = facts.attempts.at(-1)?.timings;
    if (timings) {
      const speech = `${timings.deepgramLabel} ${timings.deepgramMs}ms`;
      const coach = timings.coachLabel === 'fallback' ? `fallback (${timings.coachMs}ms)` : `${timings.coachLabel} ${timings.coachMs}ms`;
      $('#last-request').textContent = `${speech} · ${coach}`;
    }
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) $('#last-request').textContent = `History unavailable: ${error.message}`; }
}

function renderComparison(current, previous) {
  const container = $('#comparison');
  const pair = storyPair(state.samples.find((s) => s.id === current.sampleId) || {});
  let before = previous;
  let after = current;
  if (pair) {
    before = [...state.results].reverse().find((item) => item.sampleId === pair.before.id);
    after = [...state.results].reverse().find((item) => item.sampleId === pair.after.id);
  }
  const matched = safeComparison(before, after);
  if (!matched) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  const difference = before.fillers - after.fillers;
  const coverageStatement = before.covered && after.covered && before.coveredBasis === 'coach' && after.coveredBasis === 'coach'
    ? 'The coach confirmed both answers are covered.'
    : 'Coverage was not confirmed by the coach for both takes.';
  const coverage = (take) => `${take.covered ? 'covered ✓' : 'not covered ✗'}${take.coveredBasis === 'coach' ? '' : ' · estimated'}`;
  container.innerHTML = `<h3>Before / after · same question</h3><div class="compare-row"><div class="compare-side"><span>BEFORE</span><b>${before.fillers} fillers · ${before.per100} / 100 · ${coverage(before)}</b></div><span class="compare-arrow">→</span><div class="compare-side"><span>AFTER</span><b>${after.fillers} fillers · ${after.per100} / 100 · ${coverage(after)}</b></div></div><div class="comparison-foot">${difference > 0 ? `${difference} fewer fillers. ${coverageStatement}` : difference < 0 ? `${Math.abs(difference)} more fillers this take. ${coverageStatement}` : `Same filler count. ${coverageStatement}`}</div>`;
}

function renderResult(result, previous = null) {
  $('#results').classList.remove('hidden');
  state.nextQuestion = result.question;
  $('#practice-question').textContent = result.question;
  $('#result-title').textContent = result.verdict === 'not_a_win' ? 'Silence isn’t a win — you skipped the answer.' : result.verdict === 'starving' ? 'You starved the goblin!' : 'Your goblin ate well.';
  $('#coach-source').textContent = `COACH · ${result.coach === 'fallback' ? 'RULE-BASED' : result.coach.toUpperCase()}`;
  $('#stat-fillers').textContent = result.fillers;
  $('#stat-rate').textContent = result.per100;
  $('#stat-covered').textContent = result.covered ? '✓' : '✗';
  $('#stat-covered').style.color = result.covered ? 'var(--green)' : 'var(--coral)';
  $('#covered-basis').textContent = result.coveredBasis === 'coach' ? 'Coverage assessed from your full transcript.' : `covered: estimated (no coach)${result.covered ? ' · at least 15 non-filler words' : ' · fewer than 15 non-filler words'}`;
  $('#word-count').textContent = `${result.spokenWords} spoken words`;
  const transcript = $('#transcript'); transcript.replaceChildren();
  for (const word of result.transcript) {
    const span = document.createElement('span'); span.className = `word${word.filler ? ' filler' : ''}`;
    span.textContent = `${word.text} `;
    if (word.filler) span.title = `${word.word} · ${Number(word.start).toFixed(2)}–${Number(word.end).toFixed(2)} sec`;
    transcript.append(span);
  }
  $('#habit').textContent = result.advice.habit;
  $('#drill').textContent = result.advice.drill;
  $('#goblin-line').textContent = `“${result.advice.goblin_line}”`;
  $('#fallback-note').classList.toggle('hidden', result.coach !== 'fallback');
  $('#fallback-note').textContent = result.fillers === 0 ? 'Rule coach: no filler candidate to review.' : result.spokenWords < 15 ? 'Rule coach: short answer, coverage estimated.' : 'Rule-based fallback · connector unavailable';
  const creature = $('#result-goblin-wrap');
  creature.classList.toggle('mood-moving', false);
  $('#creature-caption').textContent = result.verdict === 'not_a_win' ? 'THE GOBLIN IS STILL HUNGRY' : result.verdict === 'starving' ? 'THE GOBLIN IS SHRINKING' : 'THE GOBLIN IS GROWING';
  if (result.covered) {
    document.querySelectorAll('um-goblin').forEach((goblin) => goblin.setAttribute('rate', result.per100));
    $('#mood-label').textContent = result.per100 < 2 ? 'GOBLIN IS STARVING' : result.per100 < 8 ? 'GOBLIN IS PECKISH' : 'GOBLIN IS WELL FED';
  }
  $('#goblin-player').classList.toggle('hidden', !result.goblinAudioUrl);
  $('#audio-missing').classList.toggle('hidden', result.fillers === 0 || result.goblinAudioAvailable);
  if (result.goblinAudioUrl) $('#goblin-audio').src = result.goblinAudioUrl;
  $('#goblin-audio').onplay = () => setGoblinPlaying(true);
  $('#goblin-audio').onended = $('#goblin-audio').onpause = () => setGoblinPlaying(false);
  $('#clean-audio').pause(); $('#clean-audio').removeAttribute('src'); $('#clean-audio').load(); $('#clean-audio').disabled = true;
  renderComparison(result, previous);
  setTakeTwo(result);
  $('#clean-action').classList.remove('hidden');
  $('#clean-action').disabled = false;
  $('#clean-action').innerHTML = '♫ &nbsp; Hear yourself without the ums';
  $('#clean-status').textContent = '';
  $('#clean-panel').classList.add('hidden');
  $('#now-you-try').classList.add('hidden');
  $('#original-audio').src = result.audioUrl;
}

async function uploadFile(file) {
  if (!file) return;
  const token = state.uiToken;
  $('#record-error').textContent = '';
  try {
    const result = await request(`/api/analyze?question=${encodeURIComponent(state.nextQuestion)}`, { method: 'POST', headers: { 'content-type': file.type || 'audio/webm' }, body: file });
    if (token !== state.uiToken) return;
    state.results.push(result); renderResult(result, state.results.at(-2)); await refreshHistory(false, token); $('#results').scrollIntoView({ behavior: 'smooth' });
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) $('#record-error').textContent = error.message; }
}

async function startRecording() {
  const token = state.uiToken;
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording is not available here. Upload an audio file instead.');
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (token !== state.uiToken) { state.stream.getTracks().forEach((track) => track.stop()); return; }
    const chunks = [];
    state.chunks = chunks;
    const recorder = new MediaRecorder(state.stream);
    state.recorder = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      clearInterval(state.timer); state.stream?.getTracks().forEach((track) => track.stop());
      if (token !== state.uiToken) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      $('#record-status').textContent = 'Goblin is listening…';
      try {
        const result = await request(`/api/analyze?question=${encodeURIComponent(state.nextQuestion)}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
        if (token !== state.uiToken) return;
        state.results.push(result); renderResult(result, state.results.at(-2)); await refreshHistory(false, token); $('#results').scrollIntoView({ behavior: 'smooth' });
      } catch (error) { if (!wasAborted(error) && token === state.uiToken) $('#record-error').textContent = error.message; }
      if (token !== state.uiToken) return;
      $('#record-status').textContent = 'Ready when you are'; $('#record-hint').textContent = 'Your recording stays in this practice lair.';
    };
    recorder.start(); state.started = Date.now();
    $('#record').classList.add('hidden'); $('#stop-record').classList.remove('hidden'); $('#record-orb').classList.add('recording');
    $('#record-status').textContent = 'You’re recording'; $('#record-hint').textContent = 'Take a breath. You have up to 90 seconds.';
    state.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.started) / 1000);
      $('#timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= 90) stopRecording();
    }, 250);
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) $('#record-error').textContent = error.message; }
}
function stopRecording() {
  if (state.recorder?.state === 'recording') state.recorder.stop();
  $('#record').classList.remove('hidden'); $('#stop-record').classList.add('hidden'); $('#record-orb').classList.remove('recording');
}

$$('.entrance').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('#play-story').addEventListener('click', playStory);
$('#hear-sample').addEventListener('click', async () => {
  const sample = state.samples.find((item) => item.id === $('#hear-sample').dataset.sample);
  if (!sample) return;
  const controller = new AbortController(); state.controllers.add(controller);
  try { const response = await fetch(`/samples/${encodeURIComponent(sample.file)}`, { signal: controller.signal }); if (!response.ok) throw new Error('Original audio is not available.'); state.sampleAudio = new Audio(URL.createObjectURL(await response.blob())); await state.sampleAudio.play(); }
  catch (error) { if (!wasAborted(error)) showToast(error.message); }
  finally { state.controllers.delete(controller); }
});
$('#record').addEventListener('click', startRecording);
$('#stop-record').addEventListener('click', stopRecording);
$('#upload').addEventListener('change', (event) => uploadFile(event.target.files[0]));
$('#play-goblin').addEventListener('click', playGoblinAudio);
$('#clean-action').addEventListener('click', () => {
  const result = state.results.at(-1);
  if (result) runGoblinEdit(result);
});
$('#now-you-try').addEventListener('click', () => {
  $('#practice-question').textContent = state.nextQuestion;
  setMode('try');
  $('#record').focus();
});
$('#next-take').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!button.dataset.sample) { $('#practice-question').textContent = state.nextQuestion; setMode('try'); $('#results').classList.add('hidden'); $('#record').focus(); return; }
  const sample = state.samples.find((item) => item.id === button.dataset.sample);
  const before = [...state.results].reverse().find((item) => item.sampleId === button.dataset.before);
  if (!sample) return;
  const token = state.uiToken;
  setLoading(button, true, 'Take 2 →');
  try {
    const result = await analyzeSample(sample, button);
    if (token !== state.uiToken) return;
    state.results.push(result); renderResult(result, before); await refreshHistory(false, token);
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await playGoblinAudio();
    if (token === state.uiToken) await runGoblinEdit(result, false, token);
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) showToast(error.message); }
  finally { setLoading(button, false, button.dataset.sample ? 'Take 2 →' : 'Next take →'); }
});
$('#reset').addEventListener('click', () => {
  state.uiToken++;
  for (const controller of state.controllers) controller.abort();
  state.controllers.clear();
  clearInterval(state.timer);
  if (state.recorder) {
    state.recorder.onstop = null;
    if (state.recorder.state !== 'inactive') state.recorder.stop();
    state.recorder = null;
  }
  state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null;
  for (const selector of ['#goblin-audio', '#original-audio', '#clean-audio']) {
    const audio = $(selector); audio.pause(); audio.removeAttribute('src'); audio.load();
  }
  state.sampleAudio?.pause(); state.sampleAudio = null; setGoblinPlaying(false);
  state.results = []; state.nextQuestion = state.samples[0]?.question || 'Tell me about a difficult situation at work.';
  $('#practice-question').textContent = state.nextQuestion;
  $('#results').classList.add('hidden'); $('#clean-panel').classList.add('hidden'); $('#clean-action').disabled = false;
  $('#clean-status').textContent = ''; $('#now-you-try').classList.add('hidden');
  $('#gate-result').textContent = 'Waiting for a gate test…';
  $('#record-error').textContent = ''; $('#upload').value = ''; $('#timer').textContent = '00:00';
  $('#record').classList.remove('hidden'); $('#stop-record').classList.add('hidden'); $('#record-orb').classList.remove('recording');
  $('#clean-measure').textContent = 'Not run yet'; $('#clean-measure-tag').textContent = 'PENDING'; $('#clean-measure-tag').className = 'tag target';
  document.querySelectorAll('um-goblin').forEach((goblin) => { goblin.setAttribute('rate', 14.5); goblin.removeAttribute('playing'); });
  $('#mood-label').textContent = 'GOBLIN IS WELL FED';
  if (!state.samples.length) initialize(state.uiToken);
  showToast('Session reset. The lair history still remembers.');
});
$('#gate-test').addEventListener('click', async () => {
  const token = state.uiToken;
  const button = $('#gate-test'); setLoading(button, true, 'Test the gate ↗'); $('#gate-result').textContent = 'Sending a request through the connector…';
  try { const result = await request('/api/gate-test', { method: 'POST' }); if (token === state.uiToken) $('#gate-result').textContent = result.ok ? JSON.stringify(result, null, 2) : `${result.status ? `HTTP ${result.status}\n` : ''}${result.error}`; }
  catch (error) { if (!wasAborted(error) && token === state.uiToken) $('#gate-result').textContent = error.message; }
  finally { if (token === state.uiToken) setLoading(button, false, 'Test the gate ↗'); }
});

async function initialize(token) {
  try {
    state.samples = await request('/api/samples');
    if (token !== state.uiToken) return;
    if (state.samples[0]) showStorySample(state.samples[0]);
    await refreshHistory(true, token);
  } catch (error) { if (!wasAborted(error) && token === state.uiToken) showToast(error.message); }
}

initialize(state.uiToken);
