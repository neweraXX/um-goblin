const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.UG_DATA?.source === 'live' && cleanResult?.mock, null, { timeout: 20000 });
    await page.screenshot({ path: `shots/${name}-initial.png`, fullPage: true });
    await page.locator('#ug-scene-try').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `shots/${name}-record.png` });
    await page.evaluate(() => {
      window.qaMotion = { coachStart: 0, coachEnd: 0, offscreenPill: false };
      window.qaTimer = setInterval(() => {
        const stage = document.getElementById('ug-story-progress').textContent;
        if (stage.includes('2/4') && !qaMotion.coachStart) qaMotion.coachStart = performance.now();
        if (stage.includes('3/4') && qaMotion.coachStart && !qaMotion.coachEnd) qaMotion.coachEnd = performance.now();
        const pill = document.querySelector('#ug-spotlight-transcript .ug-spotlight-pill-target');
        if (pill && !document.getElementById('ug-eating-spotlight').hidden) {
          const bounds = document.getElementById('ug-spotlight-transcript').getBoundingClientRect(), rect = pill.getBoundingClientRect();
          if (rect.top < bounds.top || rect.bottom > bounds.bottom) qaMotion.offscreenPill = true;
        }
      }, 40);
    });
    await page.locator('[data-action="play-story"]').first().click();
    await page.waitForSelector('#ug-spotlight-transcript .ug-spotlight-pill-target', { timeout: 60000 });
    await page.screenshot({ path: `shots/${name}-word-glow.png` });
    await page.waitForSelector('.ug-pill-flyer');
    await page.screenshot({ path: `shots/${name}-word-flight.png` });
    await page.waitForFunction(() => {
      const spotlight = document.querySelector('#ug-eating-spotlight');
      const eaten = document.querySelectorAll('#ug-spotlight-transcript .ug-spotlight-pill-eaten').length;
      return spotlight && !spotlight.hidden && eaten > 0;
    }, null, { timeout: 60000 });
    await page.screenshot({ path: `shots/${name}-goblin-eating.png` });
    await page.waitForFunction(() => document.querySelector('#ug-story-caption')?.textContent === 'Did the goblin eat any real words? It listens again to check.' && !document.querySelector('#ug-story-comparison')?.hidden, null, { timeout: 180000 });
    const comparison = await page.locator('#ug-story-word-counts').textContent();
    if (!/Before: \d+ words \+ \d+ ums\s+→\s+After: \d+ words \+ \d+ ums/.test(comparison || '')) throw new Error(`${name}: before/after word comparison missing: ${comparison}`);
    await page.screenshot({ path: `shots/${name}-checker.png` });
    const motion = await page.evaluate(() => qaMotion);
    if (motion.coachEnd - motion.coachStart < 6900) throw new Error(`${name}: coach scene shorter than 7 seconds`);
    if (motion.offscreenPill) throw new Error(`${name}: eating pill left the transcript viewport`);
    if (name === 'mobile' && await page.locator('#ug-story-guide').evaluate((el) => el.getBoundingClientRect().height > innerHeight * .12 + 1)) throw new Error('mobile: story banner exceeds 12% of the viewport');
    await page.waitForFunction(() => !state.story.playing, null, { timeout: 15000 });
    if (!await page.locator('#ug-story-guide').isHidden()) throw new Error(`${name}: completed story banner is still visible`);
    await page.screenshot({ path: `shots/${name}-result.png` });
    await page.evaluate(() => clearInterval(qaTimer));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`${name}: horizontal overflow detected`);
    if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
    await page.close();
    console.log(`PASS ${name}: glow/flight/checker/result screenshots, coach >=7s, visible pills, no overflow`);
  }
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
