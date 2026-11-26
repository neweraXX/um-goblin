import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAnswer, buildFfmpegFilter, countFillers, extractWords, perHundred } from '../lib/analysis.mjs';
import { fallbackCoach, validateCoach } from '../lib/coach.mjs';
import { loadManifest } from '../lib/manifest.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
test('fixture has nine fillers and a stable per-hundred metric', async () => {
  const payload = await import('node:fs/promises').then((fs) => fs.readFile(resolve(root, 'fixtures/spacewalk.deepgram.json'), 'utf8')).then(JSON.parse);
  const words = extractWords(payload);
  assert.equal(countFillers(words), 9);
  assert.equal(perHundred(words), 14.5);
});
test('anti-cheat blocks silence and short answers', () => {
  assert.equal(assessAnswer([], true).verdict, 'not_a_win');
  assert.equal(assessAnswer(Array.from({ length: 16 }, () => ({ word: 'hello' })), false).covered, false);
});
test('filter graph trims, concatenates, and transforms filler clips', () => {
  const graph = buildFfmpegFilter([{ start: 1, end: 1.2 }, { start: 2, end: 2.2 }]);
  assert.match(graph, /atrim=0\.960:1\.260/);
  assert.match(graph, /concat=n=2/);
  assert.match(graph, /aecho/);
});
test('coach schema rejects malformed values and provides fallback', () => {
  assert.equal(validateCoach('{bad'), null);
  assert.equal(validateCoach({}), null);
  assert.equal(fallbackCoach([{ index: 2, filler: true }], false).verdict, 'not_a_win');
});
test('manifest loads sample and validates its shape', async () => {
  const samples = await loadManifest(resolve(root, 'samples/manifest.json'));
  assert.equal(samples[0].id, 'spacewalk');
  assert.equal(samples[0].role, 'before');
});
