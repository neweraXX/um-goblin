import { normalizeWord } from './normalize.mjs';
export const FILLERS = new Set(['um', 'uh']);

export function extractWords(payload) {
  const words = payload?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words)) return [];
  return words.map((word, index) => ({
    index,
    word: normalizeWord(word.word ?? word.punctuated_word),
    text: String(word.punctuated_word ?? word.word ?? ''),
    start: Number(word.start ?? 0),
    end: Number(word.end ?? word.start ?? 0),
    confidence: Number(word.confidence ?? 0),
  })).filter((word) => word.word);
}

export function countFillers(words) {
  return words.filter((word) => FILLERS.has(word.word)).length;
}

export function perHundred(words) {
  const spoken = words.filter((word) => !FILLERS.has(word.word)).length;
  return spoken ? Math.round(countFillers(words) / spoken * 1000) / 10 : 0;
}

export function assessAnswer(words, coveredPoints = true) {
  const spoken = words.filter((word) => !FILLERS.has(word.word)).length;
  if (spoken < 15 || !coveredPoints) return { covered: false, verdict: 'not_a_win', spoken };
  return { covered: true, verdict: countFillers(words) ? 'fed' : 'starving', spoken };
}

export function transcriptFrom(payload, words = extractWords(payload)) {
  return words.map((word) => ({ ...word, filler: FILLERS.has(word.word) }));
}

export function buildFfmpegFilter(wordSegments) {
  if (!wordSegments.length) return '';
  const filters = wordSegments.flatMap((segment, index) => {
    const start = Math.max(0, Number(segment.start) - 0.04).toFixed(3);
    const end = (Number(segment.end) + 0.06).toFixed(3);
    return [`[0:a]atrim=${start}:${end},asetpts=PTS-STARTPTS[s${index}]`];
  });
  const concatInputs = wordSegments.map((_, index) => `[s${index}]`).join('');
  filters.push(`${concatInputs}concat=n=${wordSegments.length}:v=0:a=1,aresample=44100,asetrate=44100*0.78,aresample=44100,aecho=0.8:0.7:70:0.35[out]`);
  return filters.join(';');
}
