import test from 'node:test';
import assert from 'node:assert/strict';
import helpers from '../public/take.js';
import { normalizeWord } from '../lib/normalize.mjs';
import { alignChangedWords, buildCleanPlan } from '../lib/clean.mjs';
import { extractWords } from '../lib/analysis.mjs';
import { mayReadAttemptAudio } from '../lib/privacy.mjs';

test('new take and reset abort old work and reject late callbacks', async () => {
  const controller = helpers.createTakeController();
  assert.equal(controller.isCurrent(null), false);
  const first = controller.begin();
  let state = 'initial';
  const late = Promise.resolve().then(() => { if (controller.isCurrent(first)) state = 'stale'; });
  const second = controller.begin();
  await late;
  assert.equal(state, 'initial');
  assert.equal(first.signal.aborted, true);
  assert.equal(controller.isCurrent(second), true);
  assert.ok(second.takeId > first.takeId);
  const reset = controller.begin();
  assert.equal(second.signal.aborted, true);
  assert.equal(controller.isCurrent(reset), true);
});

test('MIME inference and server extensions cover browser upload/record formats', () => {
  for (const [name, mime, ext] of [
    ['voice.M4A', 'audio/mp4', '.m4a'], ['a.wav', 'audio/wav', '.wav'],
    ['a.mp3', 'audio/mpeg', '.mp3'], ['a.ogg', 'audio/ogg', '.ogg'],
    ['a.flac', 'audio/flac', '.flac'], ['a.aac', 'audio/aac', '.aac'],
    ['a.webm', 'audio/webm', '.webm'],
  ]) {
    assert.equal(helpers.audioMime(name), mime);
    assert.equal(helpers.audioExtension(`${mime};codecs=opus`), ext);
    assert.equal(mayReadAttemptAudio({ sessionId: 'a' }, 'a', `answer${ext}`), true);
  }
  assert.equal(helpers.audioMime('bad.txt'), '');
  assert.equal(helpers.audioMime('a.wav', 'audio/ogg'), 'audio/ogg');
  assert.equal(helpers.audioExtension('audio/x-m4a'), '.m4a');
});

test('Unicode normalization preserves distinct words and canonical equivalence', () => {
  assert.equal(normalizeWord('MẸ!'), 'mẹ');
  assert.equal(normalizeWord('me\u0323'), 'mẹ');
  assert.notEqual(normalizeWord('mẹ'), normalizeWord('mà'));
  const before = [{ word: 'mẹ', text: 'mẹ', start: 1 }];
  assert.equal(alignChangedWords(before, [{ word: 'mà', text: 'mà' }]).length, 1);
  assert.deepEqual(alignChangedWords(before, [{ word: 'me\u0323' }]), []);
  const words = extractWords({ results: { channels: [{ alternatives: [{ words: [{ word: 'mẹ' }, { word: '東京' }] }] }] } });
  assert.deepEqual(words.map((word) => word.word), ['mẹ', '東京']);
});

test('removing an all-filler clip produces silence instead of restoring the original', () => {
  const plan = buildCleanPlan([{ index: 0, word: 'um', filler: true, start: 0, end: 1 }], 1);
  assert.deepEqual(plan.segments, []);
  assert.match(plan.filtergraph, /anullsrc/);
  assert.ok(plan.duration <= 0.1);
});

test('story excerpt contains the first filler even when it occurs late in a take', () => {
  const words = [{ s: 0, e: 1, f: false }, { s: 31, e: 31.4, f: true }];
  assert.deepEqual(helpers.previewRange(words, 90), { start: 29.5, end: 34.5 });
  assert.deepEqual(helpers.previewRange([{ s: 9.8, e: 10, f: true }], 10), { start: 5, end: 10 });
  assert.deepEqual(helpers.previewRange([], 2), { start: 0, end: 2 });
});

test('A/B edit range removes filler spans while keeping the same original section', () => {
  const words = [{ s: 2, e: 2.5, f: true }, { s: 10, e: 10.5, f: true }];
  const range = helpers.editPreviewRange(words, { start: 8.5, end: 13.5 }, 20);
  assert.ok(Math.abs(range.start - 7.94) < 0.001);
  assert.ok(Math.abs(range.end - 12.38) < 0.001);
  assert.ok(range.end - range.start <= 5);
  const overlap = helpers.editPreviewRange([{ s: 1, e: 2, f: true }, { s: 1.5, e: 2.5, f: true }], { start: 0, end: 5 }, 5);
  assert.ok(Math.abs(overlap.end - 3.44) < 0.001);
});

test('duration estimate changes with the actual take and skips listening for user results', () => {
  const words = [{ s: 1, e: 1.3, f: true }];
  assert.ok(helpers.storySeconds(words, 25, 2) < 90);
  assert.equal(helpers.storySeconds(words, 25, 2) - helpers.storySeconds(words, 25, 2, true), 5);
});
