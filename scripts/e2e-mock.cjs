// Local MOCK browser regression. Delayed routes exercise take cancellation without provider calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = JSON.parse(fs.readFileSync('fixtures/spacewalk.deepgram.json', 'utf8'));
let count = 0, sequence = 0;
const check = (label, value) => { assert.ok(value, label); count++; console.log(`PASS ${label}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/analyze?question=*', async (route) => {
      const body = route.request().postDataBuffer().toString();
      const label = /^[a-z-]+$/.test(body) ? body : 'microphone';
      if (label.startsWith('slow-')) await sleep(900);
      const words = fixture.results.channels[0].alternatives[0].words.filter((word) => label !== 'zero' || !['um', 'uh'].includes(word.word)).map((word, index) => ({
        index, word: word.word, text: index === 0 ? label : word.punctuated_word || word.word,
        start: word.start, end: word.end, filler: ['um', 'uh'].includes(word.word),
      }));
      await route.fulfill({ json: { id: `qa-${label}-${++sequence}`, words, fillers: label === 'zero' ? 0 : 9, spokenWords: 62, per100: 14.5,
        covered: true, durationSeconds: 25.9, question: 'Your question?', audioUrl: '/samples/spacewalk.wav', goblinAudioUrl: '/samples/spacewalk.wav',
      } }).catch(() => {});
    });
    await page.route('**/api/attempts/qa-*/clean', async (route) => {
      const url = route.request().url();
      if (url.includes('slowclean')) await sleep(5000);
      if (url.includes('badclean')) return route.fulfill({ status: 502, json: { error: 'Checker unavailable' } }).catch(() => {});
      const zero = url.includes('qa-zero-');
      return route.fulfill({ json: {
        cleanAudioUrl: zero ? null : '/samples/spacewalk.wav', contentWordsBefore: 62, contentWordsAfter: url.includes('changed') ? 61 : 62,
        changedWords: url.includes('changed') ? [{ before: 'the', after: null, time: 4.4 }] : [], removedSeconds: zero ? 0 : 2,
        mock: true, label: 'MOCK browser regression', passes: zero ? [{ pass: 0, words: 62, fillers: 0, duration: 25.9 }] :
          [{ pass: 0, words: 71, fillers: 9, duration: 25.9 }, { pass: 1, words: 62, fillers: 0, duration: 23.9 }],
      } }).catch(() => {});
    });
    await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => cleanResult?.mock);
    const upload = (label) => page.setInputFiles('#ug-audio-upload', { name: `${label}.m4a`, mimeType: '', buffer: Buffer.from(label) });
    const ready = () => page.waitForFunction(() => state.try.status === 'result');
    const stop = async () => { await page.evaluate(() => { if (state.story.playing) skipStory(); }); await page.waitForFunction(() => !activeStory); };
    const clean = () => page.evaluate(() => cleanReady);
    check('bootstrap sample replaces offline preview', await page.locator('.ug-offline-label').count() === 0);
    check('Record has a visible label and there is one silence action and one story start', /Record/.test(await page.locator('[data-action="record"]').innerText()) && await page.locator('[data-action="silence"]').count() === 1 && await page.locator('[data-action="play-story"]').count() === 1);
    check('hero promises to show changed words', /re-checked, and any changed word is shown to you/.test(await page.locator('.ug-hero-explanation').innerText()));

    await page.click('[data-action="play-story"]'); await page.waitForFunction(() => !!storySource);
    await page.evaluate(() => { window.beforePauseSource = storySource; window.beforePauseCaption = document.getElementById('ug-story-caption').textContent; });
    await page.click('[data-audio-kind="original"]'); await page.waitForFunction(() => storyAudioContext.state === 'suspended');
    await sleep(500);
    check('manual playback suspends story without ending or advancing it', await page.evaluate(() => state.story.paused && storySource === beforePauseSource && document.getElementById('ug-story-caption').textContent === beforePauseCaption && !sharedAudio.paused));
    check('manual audio shows source, moving cursors and Stop', await page.evaluate(() => document.getElementById('ug-audio-now').textContent.includes('NASA') && !document.getElementById('ug-take-cursor').hidden && parseFloat(document.getElementById('ug-take-cursor').style.left) > 0 && !document.querySelector('[data-action="stop-audio"]').hidden));
    await page.evaluate(() => playStory());
    check('repeated Play does not resume a paused story', await page.evaluate(() => state.story.paused && storyAudioContext.state === 'suspended'));
    await page.click('[data-action="stop-audio"]');
    check('Stop resets manual audio', await page.evaluate(() => sharedAudio.paused && sharedAudio.currentTime === 0 && document.getElementById('ug-take-cursor').hidden));
    await page.click('#ug-story-guide [data-action="pause-story"]');
    await page.waitForFunction(() => storyAudioContext.state === 'running');
    check('Resume keeps the story source', await page.evaluate(() => storySource === beforePauseSource));
    await page.evaluate(() => resetDemo()); await sleep(300);
    check('Reset clears source, audio context and story timers', await page.evaluate(() => !storySource && !state.story.playing && !storyAudioContext));

    let analyzedAt = 0;
    page.on('response', (response) => { if (response.url().includes('/api/analyze?question=') && response.ok()) analyzedAt = Date.now(); });
    await upload('slowclean'); await ready();
    await page.waitForFunction(() => state.story.playing && state.story.userTake && !document.getElementById('ug-eating-spotlight').hidden);
    check('upload opens its eating scene within 3s, without waiting for clean', Date.now() - analyzedAt < 3000 && await page.evaluate(() => !cleanResult && UG_DATA.id.includes('slowclean')));
    check('free take shows filename and Topic not checked', await page.evaluate(() => UG_DATA.sample.speaker === 'slowclean.m4a' && /Topic not checked/.test(document.getElementById('ug-coach-content').textContent) && !/Answer covered/.test(document.getElementById('ug-coach-content').textContent)));
    await page.waitForFunction(() => /snacks on the menu/.test(document.getElementById('ug-spotlight-caption').textContent));
    const introduced = Date.now();
    await page.waitForFunction(() => document.querySelector('#ug-spotlight-transcript .ug-spotlight-pill-target'));
    check('menu introduction lasts at least 1.5s before the first glow', Date.now() - introduced >= 1400);
    const glowStart = Date.now();
    await page.waitForFunction(() => !!document.querySelector('.ug-pill-flyer'));
    check('first word glows for 0.5s before its flight', Date.now() - glowStart >= 420);
    const flightStart = Date.now();
    await page.waitForFunction(() => !document.querySelector('.ug-pill-flyer'));
    check('first flight lasts about 1s', Date.now() - flightStart >= 850);
    await stop(); await clean();
    check('finished story hides banner, clears Burp, offers another take', await page.evaluate(() => document.getElementById('ug-story-guide').hidden && document.getElementById('ug-spotlight-caption').textContent === '' && /Record another take/.test(document.getElementById('ug-story-end-actions').textContent)));
    await page.click('[data-action="replay-story"]'); await page.waitForFunction(() => !!storySource);
    check('Watch again keeps the user take', await page.evaluate(() => state.story.userTake && UG_DATA.id.includes('slowclean')));

    await upload('slow-first'); await sleep(80); await upload('fast-second'); await ready(); await sleep(1100);
    check('late response cannot replace the newer take or its automatic story', await page.evaluate(() => UG_DATA.id.includes('fast-second') && UG_DATA.take.words[0].t === 'fast-second' && state.story.userTake));
    await stop();
    await upload('slow-reset'); await page.evaluate(() => resetDemo()); await sleep(1100);
    check('Reset during upload rejects late state', await page.evaluate(() => state.try.status === 'idle' && !lastPracticeAttempt && UG_DATA.sample.isSample));

    await page.evaluate(() => {
      window.blockAudio = true;
      const descriptor = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state');
      Object.defineProperty(AudioContext.prototype, 'state', { configurable: true, get() { return window.blockAudio ? 'suspended' : descriptor.get.call(this); } });
    });
    await upload('blocked'); await ready(); await page.waitForFunction(() => state.try.needsPlay);
    check('blocked autoplay exposes a large Play my result in the try panel', await page.locator('#ug-try-content [data-action="play-my-take"]').isVisible() && await page.locator('.ug-result-play').evaluate((el) => el.getBoundingClientRect().height >= 52));
    await page.evaluate(() => { window.blockAudio = false; });
    await page.click('[data-action="play-my-take"]'); await page.waitForFunction(() => !!storySource);
    check('Play my result retries the same take', await page.evaluate(() => UG_DATA.id.includes('blocked') && state.story.userTake));
    await stop();

    await upload('changed'); await ready(); await clean(); await stop();
    check('changed word warning sits beside the edit button', await page.locator('.ug-edit-listen .ug-edit-warning').evaluate((el) => el.textContent.includes('1 word changed: ‘the’') && el.textContent.includes('listen before you use this edit')));
    await page.click('[data-action="play-edit"]'); await page.waitForFunction(() => sharedAudio && !sharedAudio.paused);
    check('Play the edit plays clean audio with its filename', await page.evaluate(() => sharedAudio.dataset.kind === 'edit' && document.getElementById('ug-audio-now').textContent.includes('changed.m4a')));
    await upload('zero'); await ready(); await clean(); await stop();
    check('zero filler take keeps usable original/edit audio', await page.evaluate(() => !UG_DATA.take.fillers && UG_DATA.cleanAudioUrl === UG_DATA.audioUrl));
    await page.evaluate(async () => { UG_DATA.goblinAudioUrl = '/samples/missing.wav'; await loadStoryAudio(takeController.current); });
    check('one failed audio load retains other buffers', await page.evaluate(() => !!storyAudioBuffers.original && !!storyAudioBuffers.edit && !storyAudioBuffers.burp));
    await page.evaluate(async () => {
      const decode = storyAudioContext.decodeAudioData.bind(storyAudioContext);
      storyAudioContext.decodeAudioData = async (bytes) => { const buffer = await decode(bytes); await new Promise((resolve) => setTimeout(resolve, 400)); return buffer; };
      const pending = loadStoryAudio(takeController.current); resetDemo(); await pending;
    });
    check('late decode after Reset cannot revive buffers', await page.evaluate(() => !storyAudioContext && !storyAudioBuffers.original));
    await upload('badclean'); await ready(); await clean(); await stop();
    await page.evaluate(() => showCheckerComparison(storyAttempt, cleanResult));
    check('failed clean reports unknown results', await page.evaluate(() => !cleanResult && /unknown/.test(document.getElementById('ug-story-changed-words').textContent)));

    await page.evaluate(() => {
      window.streams = []; window.micCalls = 0;
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => { micCalls++; const stream = await original(...args); streams.push(stream); await new Promise((resolve) => setTimeout(resolve, 400)); return stream; };
      startRecording(); startRecording();
    });
    await page.evaluate(() => resetDemo()); await sleep(900);
    check('double mic acquisition is locked and a late stream is stopped', await page.evaluate(() => micCalls === 1 && streams.length === 1 && streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))));
    await page.click('[data-action="record"]'); await page.waitForFunction(() => state.try.status === 'recording');
    await page.click('[data-action="record"]'); await ready();
    check('stopping a recording automatically opens its own result', await page.evaluate(() => state.story.playing && state.story.userTake && UG_DATA.id.includes('microphone')));
    await upload('after-recording'); await ready(); await stop();
    check('upload stops recorder and microphone tracks', await page.evaluate(() => !recorder && !mediaStream && streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'))));
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; startRecording(); });
    await page.waitForFunction(() => state.try.status === 'error');
    check('denied microphone shows a friendly error', await page.evaluate(() => /Microphone access was denied/.test(state.try.error)));
    await page.route('**/api/history?visit=1', async (route) => { await sleep(600); await route.continue(); });
    await page.route('**/api/gate-test', (route) => route.fulfill({ json: { status: 404, error: 'Rejected unknown connector' } }));
    await page.click('[data-action="open-judge"]'); await page.click('[data-action="test-gate"]'); await sleep(1000);
    check('gate result survives history rerender', /404/.test(await page.locator('#ug-gate-status').textContent()));
    await page.click('button[data-action="close-judge"]');
    check('no browser exceptions', errors.length === 0);
    console.log(`${count}/${count} browser checks passed`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
