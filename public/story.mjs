export function findStoryPair(samples, sampleOrId) {
  const sample = typeof sampleOrId === 'string' ? samples.find((item) => item.id === sampleOrId) : sampleOrId;
  if (!sample) return null;
  const matching = samples.filter((item) => item.question === sample.question);
  const before = matching.find((item) => item.role === 'before');
  const after = matching.find((item) => item.role === 'after');
  return before && after ? { before, after } : null;
}

export function safeComparison(before, after) {
  if (!before || !after || before.question !== after.question) return null;
  return { before, after };
}
