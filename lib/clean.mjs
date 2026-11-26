import { normalizeWord } from './normalize.mjs';
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
  if (!segments.length) return { segments: [], filtergraph: 'anullsrc=r=16000:cl=mono,atrim=duration=0.1[out]', duration: 0.1 };
  const filtergraph = buildCleanFiltergraph(segments);
  const outputDuration = segments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  return { segments, filtergraph, duration: outputDuration };
}

export function buildCleanSummary(wordsBefore, wordsAfter, durationBefore, durationAfter) {
  const contentWords = (words) => words.filter((word) => !word.filler && !FILLERS.has(String(word.word).toLowerCase())).length;
  const before = Number(durationBefore);
  const after = Number(durationAfter);
  return {
    contentWordsBefore: contentWords(wordsBefore),
    contentWordsAfter: contentWords(wordsAfter),
    removedSeconds: Number(Math.max(0, before - after).toFixed(2)),
  };
}

export function alignChangedWords(wordsBefore, wordsAfter) {
  const content = (words) => words.filter((word) => !word.filler && !FILLERS.has(String(word.word).toLowerCase()));
  const before = content(wordsBefore);
  const after = content(wordsAfter);
  const token = (word) => normalizeWord(word.word ?? word.text);
  const rows = before.length + 1;
  const cols = after.length + 1;
  const costs = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = 0; i < rows; i += 1) costs[i][0] = i;
  for (let j = 0; j < cols; j += 1) costs[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const substitution = costs[i - 1][j - 1] + (token(before[i - 1]) === token(after[j - 1]) ? 0 : 1);
      costs[i][j] = Math.min(substitution, costs[i - 1][j] + 1, costs[i][j - 1] + 1);
    }
  }

  const changed = [];
  let i = before.length;
  let j = after.length;
  while (i || j) {
    if (i && j && token(before[i - 1]) === token(after[j - 1]) && costs[i][j] === costs[i - 1][j - 1]) {
      i -= 1; j -= 1; continue;
    }
    if (i && j && costs[i][j] === costs[i - 1][j - 1] + 1) {
      changed.push({ before: before[i - 1].text ?? before[i - 1].word, after: after[j - 1].text ?? after[j - 1].word, time: Number(before[i - 1].start ?? before[i - 1].s ?? 0) });
      i -= 1; j -= 1; continue;
    }
    if (i && costs[i][j] === costs[i - 1][j] + 1) {
      changed.push({ before: before[i - 1].text ?? before[i - 1].word, after: null, time: Number(before[i - 1].start ?? before[i - 1].s ?? 0) });
      i -= 1; continue;
    }
    changed.push({ before: null, after: after[j - 1].text ?? after[j - 1].word, time: Number(after[j - 1].start ?? after[j - 1].s ?? 0) });
    j -= 1;
  }
  return changed.reverse();
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
