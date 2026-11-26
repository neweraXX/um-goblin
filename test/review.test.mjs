import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHabitCandidates } from '../lib/habits.mjs';
import { fallbackCoach, validateCoach } from '../lib/coach.mjs';
import { createRateLimiter, requestIp } from '../lib/rate-limit.mjs';
import { filterSessionAttempts, mayReadAttemptAudio } from '../lib/privacy.mjs';
import { findStoryPair, safeComparison } from '../public/story.mjs';
import { buildCleanPlan } from '../lib/clean.mjs';

const word = (index, text, start = index) => ({ index, word: text.toLowerCase().replace(/[^a-z0-9]/g, ''), text, start, filler: ['um', 'uh'].includes(text.toLowerCase().replace(/[^a-z]/g, '')) });

test('habit candidates cover sentence starts, transitions, details, phrase breaks, and quick repeats', () => {
  const words = [
    word(0, 'Um,', 0), word(1, 'we', 0.2), word(2, 'worked', 0.4), word(3, 'and', 1), word(4, 'uh,', 1.3), word(5, 'NASA', 1.5),
    word(6, 'announced', 2), word(7, 'um,', 3), word(8, '2024', 3.3), word(9, 'the', 4), word(10, 'uh,', 4.3), word(11, 'launch.', 4.5),
  ];
  const candidates = buildHabitCandidates(words);
  const byId = Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate]));
  assert.deepEqual(byId.thought_start.fillerIndexes, [0]);
  assert.deepEqual(byId.after_transition.fillerIndexes, [4]);
  assert.deepEqual(byId.before_detail.fillerIndexes, [4, 7]);
  assert.ok(byId.mid_phrase.fillerIndexes.includes(10));
  assert.deepEqual(byId.quick_repeat.fillerIndexes, [0, 4, 7, 10]);
});

test('coach evidence is filtered to filler indexes and candidate IDs are enforced', () => {
  const value = {
    habit: 'A filler arrives after a transition word.', habit_id: 'after_transition', evidence: [4, 5, 4],
    drill: 'Pause after the transition before continuing.', covered_points: true, verdict: 'fed',
    goblin_line: 'Those ums were delicious; my goblin belly demands seconds!',
  };
  const validated = validateCoach(value, { fillerIndexes: [4], candidateIds: ['after_transition'] });
  assert.deepEqual(validated.evidence, [4]);
  assert.equal(validateCoach({ ...value, habit_id: 'invented' }, { fillerIndexes: [4], candidateIds: ['after_transition'] }), null);
  assert.equal(validateCoach({ ...value, drill: 'A short summary of your answer.' }, { fillerIndexes: [4], candidateIds: ['after_transition'] }), null);
  assert.equal(validateCoach({ ...value, goblin_line: 'That was a nice answer!' }, { fillerIndexes: [4], candidateIds: ['after_transition'] }), null);
});

test('fallback coaching chooses the strongest observed habit candidate', () => {
  const words = [word(0, 'Um,', 0), word(1, 'well', 1), word(2, 'uh,', 2), word(3, 'we', 3), word(4, 'um,', 4)];
  const candidates = buildHabitCandidates(words);
  const fallback = fallbackCoach(words, true, candidates);
  assert.equal(fallback.habit_id, 'quick_repeat');
  assert.deepEqual(fallback.evidence, [0, 2, 4]);
  assert.match(fallback.drill, /^Pause\b/);
});

test('story pairing requires a before and after sample with the same question', () => {
  const samples = [
    { id: 'first', question: 'Tell me about a challenge.', role: 'before' },
    { id: 'second', question: 'Tell me about a challenge.', role: 'after' },
    { id: 'other', question: 'A different question?', role: 'after' },
  ];
  assert.deepEqual(findStoryPair(samples, 'first'), { before: samples[0], after: samples[1] });
  assert.equal(findStoryPair(samples, 'other'), null);
  assert.equal(safeComparison({ question: 'same' }, undefined), null);
  assert.equal(safeComparison({ question: 'one' }, { question: 'two' }), null);
  assert.ok(safeComparison({ question: 'same' }, { question: 'same' }));
});

test('history and audio privacy are scoped to a session except public sample attempts', () => {
  const attempts = [
    { id: 'a', sessionId: 'session-a' }, { id: 'b', sessionId: 'session-b' },
    { id: 'sample', sessionId: 'session-b', sampleId: 'spacewalk', publicSample: true },
  ];
  assert.deepEqual(filterSessionAttempts(attempts, 'session-a').map((attempt) => attempt.id), ['a']);
  assert.equal(mayReadAttemptAudio(attempts[0], 'session-a', 'answer.wav'), true);
  assert.equal(mayReadAttemptAudio(attempts[0], 'session-a', 'attempt.json'), false);
  assert.equal(mayReadAttemptAudio(attempts[0], 'session-a', 'clean-deepgram-1.json'), false);
  assert.equal(mayReadAttemptAudio(attempts[1], 'session-a', 'answer.webm'), false);
  assert.equal(mayReadAttemptAudio(attempts[2], 'session-a', 'clean-pass-1.wav'), true);
  assert.equal(mayReadAttemptAudio(attempts[0], 'session-a', '../answer.wav'), false);
});

test('proxy IP selection trusts Fly header, then the last forwarded address, then socket', () => {
  assert.equal(requestIp({ headers: { 'fly-client-ip': '192.0.2.5', 'x-forwarded-for': '192.0.2.6, 192.0.2.7' }, socket: { remoteAddress: '127.0.0.1' } }), '192.0.2.5');
  assert.equal(requestIp({ headers: { 'x-forwarded-for': '192.0.2.6, 192.0.2.7' }, socket: { remoteAddress: '127.0.0.1' } }), '192.0.2.7');
  assert.equal(requestIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
});

test('clean plan keeps speech around each filler with a 30ms context and builds fades', () => {
  const words = [
    { index: 0, word: 'the', text: 'The', start: 0, end: 0.3, filler: false },
    { index: 1, word: 'um', text: 'um,', start: 0.6, end: 0.8, filler: true },
    { index: 2, word: 'answer', text: 'answer', start: 1, end: 1.4, filler: false },
  ];
  const plan = buildCleanPlan(words, 2);
  assert.deepEqual(plan.segments, [{ start: 0, end: 0.57 }, { start: 0.8300000000000001, end: 2 }]);
  assert.match(plan.filtergraph, /atrim=0\.000:0\.570/);
  assert.match(plan.filtergraph, /afade=t=in/);
  assert.match(plan.filtergraph, /concat=n=2/);
});

test('rate limiter caps each IP hourly and all IPs daily, then resets windows', () => {
  let time = 0;
  const perIpLimiter = createRateLimiter({ perIp: 2, globalPerDay: 20, hourMs: 100, dayMs: 1000, now: () => time });
  assert.equal(perIpLimiter.consume('a').allowed, true);
  assert.equal(perIpLimiter.consume('a').allowed, true);
  assert.equal(perIpLimiter.consume('a').allowed, false);
  time = 101;
  assert.equal(perIpLimiter.consume('a').allowed, true);
  const globalLimiter = createRateLimiter({ perIp: 20, globalPerDay: 2, hourMs: 100, dayMs: 1000, now: () => time });
  assert.equal(globalLimiter.consume('a').allowed, true);
  assert.equal(globalLimiter.consume('b').allowed, true);
  assert.equal(globalLimiter.consume('c').allowed, false);
  time = 1101;
  assert.equal(globalLimiter.consume('a').allowed, true);
});
