// LIVE end-to-end check of every user path in codex/QA-CHECKLIST.md.
// Runs ON the Sprite (real Deepgram + OpenRouter via connectors) against BASE (default http://localhost:8091).
// Usage: node scripts/e2e-live.cjs [clip1.wav] [clip2.wav]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8091';
const [CLIP1, CLIP2] = process.argv.slice(2);
const results = [];
const check = (id, ok, detail = '') => { results.push({ id, ok: Boolean(ok), detail: String(detail).slice(0, 160) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, timeout = 60000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await sleep(300); }
  return false;
}
const offlineVisible = (page) => page.evaluate(() => [...document.querySelectorAll('.ug-offline-label, .ug-edit-label, body')].some((el) => /Offline preview/.test(el.innerText || '')));
const playing = (page) => page.evaluate(() => ({ shared: !!sharedAudio && !sharedAudio.paused, kind: sharedAudio?.dataset.kind, story: !!storySource && storyAudioContext?.state === 'running', storyPaused: state.story.paused, storyPlaying: state.story.playing }));
const toast = (page) => page.evaluate(() => document.querySelector('.ug-toast, #ug-toast')?.innerText || '');
async function storyControl(page, action) {
  const overlay = await page.locator('#ug-eating-spotlight').isVisible();
  await page.locator(`${overlay ? '#ug-eating-spotlight' : '#ug-story-guide'} [data-action="${action}"]`).click();
}
async function stopStory(page) {
  if (await page.evaluate(() => state.story.playing)) await storyControl(page, 'skip-story');
  await waitFor(page, () => !activeStory, 10000);
}
async function reset(page) {
  await page.locator(await page.locator('#ug-eating-spotlight').isVisible() ? '#ug-eating-spotlight [data-action="reset"]' : 'header [data-action="reset"]').click();
}
async function checkWarning(page, label) {
  const warning = await page.evaluate(() => ({ count: cleanResult?.changedWords?.length || 0, text: document.querySelector('.ug-edit-warning')?.textContent || '' }));
  check(label, warning.count ? warning.text.includes(`${warning.count} word`) && /listen before you use this edit/.test(warning.text) : !warning.text, JSON.stringify(warning));
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // A. fresh page
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitFor(page, () => window.UG_DATA.source === 'live' && !!cleanResult, 90000);
  check('A1 no Offline preview on load', !(await offlineVisible(page)));
  check('UX Record has a visible text label', /Record/.test(await page.locator('[data-action="record"]').innerText()));
  check('UX one silence action', await page.locator('[data-action="silence"]').count() === 1);
  await checkWarning(page, 'UX changed words warning beside edit');
  await page.click('[data-audio-kind="original"]');
  await sleep(1500);
  let p = await playing(page);
  check('A2a original plays on load', p.shared && p.kind === 'original', JSON.stringify(p));
  await page.click('[data-audio-kind="edit"]');
  await sleep(1500);
  p = await playing(page);
  const t = await toast(page);
  check('A2b goblin edit plays on load', p.shared && p.kind === 'edit' && !/isn.t available/.test(t), JSON.stringify(p) + ' toast=' + t);
  check('A3 only one sound', !(p.shared && p.story));
  await page.click('[data-audio-kind="edit"]'); // toggle off

  // B. story
  await page.click('[data-action="play-story"]');
  const captions = new Set();
  let manualPausedStory = false, endActions = false, staleBurp = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const s = await page.evaluate(() => ({ cap: document.getElementById('ug-story-progress')?.textContent + ' | ' + document.getElementById('ug-story-caption')?.textContent, playing: state.story.playing, eating: !document.getElementById('ug-eating-spotlight').hidden, staleBurp: document.getElementById('ug-eating-spotlight').hidden && /Burp!/.test(document.getElementById('ug-spotlight-caption').textContent) }));
    staleBurp ||= s.staleBurp;
    captions.add(s.cap);
    if (!manualPausedStory && Date.now() - t0 > 20000 && s.playing && !s.eating) {
      await page.click('[data-audio-kind="original"]'); await sleep(800);
      const q = await playing(page);
      check('B3 manual play pauses story', q.storyPaused && q.shared && !q.story, JSON.stringify(q));
      await page.click('[data-audio-kind="original"]'); // stop manual
      await storyControl(page, 'pause-story');
      manualPausedStory = true;
    }
    if (!s.playing && Date.now() - t0 > 5000) break;
    await sleep(700);
  }
  const capText = [...captions].join(' || ');
  check('B1 story reached scene 4', /Scene 4\/4/i.test(capText), capText.slice(-160));
  check('B1 story ate fillers', /eat/i.test(capText));
  const cmp = await page.evaluate(() => document.getElementById('ug-story-word-counts')?.innerText || '');
  check('B1 checker shows before/after', /Before/.test(cmp), cmp);
  endActions = await page.evaluate(() => !document.getElementById('ug-story-end-actions')?.hidden);
  check('B4 end actions visible', endActions);
  check('UX Burp caption cleared outside eating scene', !staleBurp);
  check('UX banner hidden after story', await page.locator('#ug-story-guide').isHidden());
  await page.click('[data-action="replay-story"]');
  check('B4 watch again starts', await waitFor(page, () => state.story.playing, 10000));
  await sleep(4000);
  await storyControl(page, 'skip-story');
  check('B2 skip finishes story', await waitFor(page, () => !state.story.playing, 20000));

  // C. try it yourself
  async function upload(file) {
    let analyzedAt = null;
    const analyzed = (response) => { if (response.url().includes('/api/analyze?question=') && response.ok()) analyzedAt = Date.now(); };
    page.on('response', analyzed);
    await page.setInputFiles('#ug-audio-upload', file);
    const ready = await waitFor(page, () => state.try.status === 'result', 90000);
    const auto = await waitFor(page, () => state.story.playing && state.story.userTake && storyAttempt?.id === window.UG_DATA.id && !document.getElementById('ug-eating-spotlight').hidden, 3000);
    page.off('response', analyzed);
    check('UX upload auto-opens own result within 3s of analysis', auto && analyzedAt != null && Date.now() - analyzedAt <= 3000);
    check('UX free take does not claim Answer covered', await page.evaluate(() => !/Answer covered/.test(document.getElementById('ug-coach-content').innerText) && /Topic not checked/.test(document.getElementById('ug-coach-content').innerText)));
    return ready;
  }
  if (CLIP1) {
    check('C1 upload → Take analyzed', await upload(CLIP1));
    const ownStory = await page.evaluate(() => state.story.playing && state.story.userTake);
    check('C1 own story starts without a second click', ownStory);
    if (ownStory) {
      const firstWord = await page.evaluate(() => window.UG_DATA.take.words[0]?.t);
      check('C2 story runs on my take', await waitFor(page, () => state.story.playing && state.story.userTake, 15000));
      await waitFor(page, () => !state.story.playing, 150000);
      check('UX own result offers Record another take', /Record another take/.test(await page.locator('#ug-story-end-actions').innerText()));
      check('UX own result hides the banner', await page.locator('#ug-story-guide').isHidden());
      check('UX own result clears Burp caption', await page.locator('#ug-spotlight-caption').textContent() === '');
      await checkWarning(page, 'UX own edit changed words warning');
      const after = await page.evaluate(() => ({ first: window.UG_DATA.take.words[0]?.t, clean: window.UG_DATA.cleanAudioUrl, offline: /Offline preview/.test(document.body.innerText) }));
      check('C2 my take data (not sample)', after.first === firstWord && !after.offline && !!after.clean, JSON.stringify(after) + ' firstBefore=' + firstWord);
      await page.click('[data-audio-kind="edit"]'); await sleep(1500);
      p = await playing(page);
      check('C2 my edit audio plays', p.shared && p.kind === 'edit', JSON.stringify(p));
      await page.click('[data-audio-kind="edit"]');
      const myId = await page.evaluate(() => window.UG_DATA.id);
      await page.click('[data-action="replay-story"]');
      check('C2 Watch again replays the same user take', await waitFor(page, (id) => state.story.playing && state.story.userTake && window.UG_DATA.id === id, 10000, myId));
      await storyControl(page, 'skip-story');
      await waitFor(page, () => !activeStory, 10000);
      await page.click('[data-action="play-edit"]'); await sleep(1200);
      p = await playing(page);
      check('C2 Play the edit plays audio', p.shared && p.kind === 'edit', JSON.stringify(p));
      await page.click('[data-audio-kind="edit"]');
    }
  }
  if (CLIP2) {
    const before = await page.evaluate(() => window.UG_DATA.take.words.slice(0, 5).map((w) => w.t).join(' '));
    check('C3 second upload', await upload(CLIP2));
    const afterW = await page.evaluate(() => window.UG_DATA.take.words.slice(0, 5).map((w) => w.t).join(' '));
    const audio = await page.request.get(BASE + await page.evaluate(() => window.UG_DATA.audioUrl));
    check('C3 data replaced', (await audio.body()).equals(fs.readFileSync(CLIP2)), `${before} → ${afterW}`);
  }
  if (CLIP1 && CLIP2) {
    await stopStory(page);
    await page.locator('[data-action="play-story"]').first().click();
    await waitFor(page, () => !!storySource, 10000);
    check('R1 upload during story', await upload(CLIP1));
    p = await playing(page);
    check('R1 old story replaced by new user story', p.storyPlaying && !p.shared && await page.evaluate(() => state.story.userTake), JSON.stringify(p));

    await page.setInputFiles('#ug-audio-upload', CLIP1);
    await sleep(100);
    await page.setInputFiles('#ug-audio-upload', CLIP2);
    const ready = await waitFor(page, () => state.try.status === 'result', 90000);
    const latestId = await page.evaluate(() => window.UG_DATA.id);
    await sleep(2000);
    const response = await page.request.get(BASE + await page.evaluate(() => window.UG_DATA.audioUrl));
    check('R2 two uploads <1s keep only file 2', ready && (await response.body()).equals(fs.readFileSync(CLIP2)) && latestId === await page.evaluate(() => window.UG_DATA.id));

    await page.setInputFiles('#ug-audio-upload', CLIP1);
    await reset(page);
    await sleep(8000);
    check('R3 Reset during upload rejects late result', await page.evaluate(() => state.try.status === 'idle' && !lastPracticeAttempt && !state.story.playing && window.UG_DATA.sample.speaker.includes('NASA')));
  }
  await stopStory(page);
  await page.click('[data-action="silence"]');
  check('C5 silence → not a win', await waitFor(page, () => /(isn.t a win|not a win|skipped the answer)/i.test(document.body.innerText), 30000));
  fs.writeFileSync('/tmp/not-audio.txt', 'hello');
  await page.setInputFiles('#ug-audio-upload', '/tmp/not-audio.txt');
  check('C6 non-audio rejected', await waitFor(page, () => /does not look like audio/i.test(document.body.innerText), 5000));
  await page.click('[data-action="record"]'); await sleep(3500);
  await page.click('[data-action="record"]');
  check('C4 fake-mic recording → result or friendly error', await waitFor(page, () => /(Take analyzed|Couldn.t finish)/.test(document.getElementById('ug-try-state-area')?.innerText || ''), 60000));
  await stopStory(page);

  // DnD + A/B length (Hà 26/11: A/B in the auto story was only a few seconds; wants drag & drop)
  if (CLIP1) {
    await page.click('[data-action="reset"]').catch(() => {}); await sleep(1500);
    await page.evaluate(() => document.getElementById('ug-scene-try').scrollIntoView());
    const b64 = fs.readFileSync(CLIP1).toString('base64');
    await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bytes], 'dropped.wav', { type: 'audio/wav' }));
      const zone = document.getElementById('ug-dropzone');
      for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, b64);
    check('DND drop file → story starts on dropped take', await waitFor(page, () => state.story.playing && state.story.userTake, 60000));
    let tBefore = null, tAfter = null; const tStart = Date.now();
    while (Date.now() - tStart < 180000) {
      const cap = await page.evaluate(() => document.getElementById('ug-story-caption')?.innerText || '');
      if (!tBefore && /^Before: the same/.test(cap)) tBefore = Date.now();
      if (tBefore && !tAfter && /^After: the same part/.test(cap)) tAfter = Date.now();
      if (tAfter && !/^After/.test(cap)) { var tEnd = Date.now(); break; }
      if (!(await page.evaluate(() => state.story.playing))) break;
      await sleep(250);
    }
    const beforeSec = tBefore && tAfter ? (tAfter - tBefore) / 1000 : 0;
    const afterSec = tAfter && typeof tEnd !== 'undefined' ? (tEnd - tAfter) / 1000 : 0;
    check('AB before part plays ≥8s', beforeSec >= 8, `before=${beforeSec.toFixed(1)}s`);
    check('AB after part plays ≥7s', afterSec >= 7, `after=${afterSec.toFixed(1)}s`);
    await page.click('[data-action="skip-story"]').catch(() => {});
    await waitFor(page, () => !state.story.playing, 20000);
  }

  // D. judge
  await page.click('[data-view="judge"]').catch(() => page.click('[data-action="open-judge"]'));
  await sleep(800);
  await page.click('[data-action="test-gate"]');
  check('D1 gate shows real 404', await waitFor(page, () => /404/.test(document.getElementById('ug-gate-status')?.innerText || ''), 20000));
  await page.locator('#ug-judge-drawer button[data-action="close-judge"]').click();
  await sleep(800);
  const drawerOpen = await page.evaluate(() => { const d = document.getElementById('ug-judge-drawer'); return d && !d.hidden && getComputedStyle(d).visibility !== 'hidden' && d.getAttribute('aria-hidden') !== 'true'; });
  check('D1 judge drawer closes', !drawerOpen);
  if (drawerOpen) await page.keyboard.press('Escape');

  // E. reset mid-story
  await page.click('[data-action="play-story"]'); await sleep(6000);
  await reset(page); await sleep(8000);
  p = await playing(page);
  check('E1 reset stops story + audio', !p.storyPlaying && !p.shared && !p.story, JSON.stringify(p));

  // F. mobile overflow + cache header
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  check('F2 mobile no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= 392));
  const res = await page.request.get(BASE + '/app.js');
  check('F3 app.js not cached', /no-cache|no-store/.test(res.headers()['cache-control'] || ''), res.headers()['cache-control']);

  check('A4 no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync('/tmp/e2e-result.json', JSON.stringify(results, null, 1));
  if (failed.length) process.exitCode = 1;
})().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
