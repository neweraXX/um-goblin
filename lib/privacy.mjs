const AUDIO_EXTENSIONS = new Set(['.wav', '.webm', '.m4a', '.mp3']);

export function filterSessionAttempts(attempts, sessionId) {
  return attempts.filter((attempt) => attempt.sessionId === sessionId);
}

export function mayReadAttemptAudio(attempt, sessionId, filename) {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension) || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  return Boolean(attempt && (attempt.sessionId === sessionId || attempt.sampleId));
}
