const FILLERS = new Set(['um', 'uh']);

export function buildCleanPlan(words, duration, { contextSeconds = 0.03 } = {}) {
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Audio duration must be a positive number.');
  const ordered = [...words].sort((a, b) => a.index - b.index);
  const fillers = ordered.filter((word) => word.filler || FILLERS.has(String(word.word).toLowerCase()));
  const segments = [];
  let cursor = 0;

  for (const filler of fillers) {
    const position = ordered.findIndex((word) => word.index === filler.index);
    const previous = ordered.slice(0, position).reverse().find((word) => !word.filler && !FILLERS.has(String(word.word).toLowerCase()));
    const next = ordered.slice(position + 1).find((word) => !word.filler && !FILLERS.has(String(word.word).toLowerCase()));
    const start = Math.max(cursor, 0, previous ? Math.max(Number(previous.end), Number(filler.start) - contextSeconds) : Number(filler.start) - contextSeconds);
    // Deepgram often stamps the next word's start a bit late; keep 80 ms before it so we never clip its first consonant.
    const end = Math.min(total, next ? Math.max(start + 0.03, Math.min(Number(next.start) - 0.08, Number(filler.end) + contextSeconds)) : Number(filler.end) + contextSeconds);
    if (start > cursor + 0.025) segments.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }

  if (total > cursor + 0.025) segments.push({ start: cursor, end: total });
  if (!segments.length) segments.push({ start: 0, end: total });
  const filtergraph = buildCleanFiltergraph(segments);
  const outputDuration = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  return { segments, filtergraph, duration: outputDuration };
}

export function buildCleanFiltergraph(segments) {
  if (!segments.length) throw new Error('At least one kept audio segment is required.');
  const filters = segments.map((segment, index) => {
    const start = Math.max(0, Number(segment.start));
    const end = Number(segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start <= 0.025) throw new Error('Kept audio segments must be longer than 25 ms.');
    const length = end - start;
    const fadeOutStart = Math.max(0, length - 0.015);
    return `[0:a]atrim=${start.toFixed(3)}:${end.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.015[k${index}]`;
  });
  filters.push(`${segments.map((_, index) => `[k${index}]`).join('')}concat=n=${segments.length}:v=0:a=1[out]`);
  return filters.join(';');
}
