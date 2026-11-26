// Shared by the browser and node tests; no DOM or media side effects.
(function (root) {
  function createTakeController() {
    let sequence = 0;
    let current = null;
    return {
      begin() {
        current?.controller.abort();
        const controller = new AbortController();
        current = { takeId: ++sequence, controller, signal: controller.signal };
        return current;
      },
      get current() { return current; },
      isCurrent(token) { return Boolean(token && current === token && !token.signal.aborted); },
    };
  }
  const audioTypes = {
    wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
    webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  };
  function audioMime(filename, type = '') {
    return type || audioTypes[String(filename).split('.').at(-1).toLowerCase()] || '';
  }
  function audioExtension(type = '') {
    const mime = type.toLowerCase().split(';')[0].trim();
    return ({ 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a',
      'audio/mp3': '.mp3', 'audio/x-flac': '.flac', 'application/ogg': '.ogg',
      ...Object.fromEntries(Object.entries(audioTypes).map(([ext, value]) => [value, `.${ext === 'mp4' ? 'm4a' : ext === 'oga' ? 'ogg' : ext}`])),
    })[mime] || '.webm';
  }
  function previewRange(words, duration, seconds = 5) {
    const total = Math.max(0, Number(duration) || 0);
    const first = words.find((word) => word.f ?? word.filler);
    const at = Number(first?.s ?? first?.start) || 0;
    const start = Math.min(Math.max(0, total - seconds), Math.max(0, at - 1.5));
    return { start, end: Math.min(total, start + seconds) };
  }
  // Claude: A/B window for the story — ~12 s containing as many fillers as possible (Hà: the 5 s A/B was too short).
  function abRange(words, duration, seconds = 12) {
    const total = Math.max(0, Number(duration) || 0);
    const span = Math.min(seconds, total);
    const fillers = words.filter((word) => word.f ?? word.filler).map((word) => Number(word.s ?? word.start) || 0);
    if (!fillers.length) return { start: 0, end: span, fillers: 0 };
    let best = { start: 0, count: -1 };
    for (const at of fillers) {
      const start = Math.min(Math.max(0, at - 1), Math.max(0, total - span));
      const count = fillers.filter((time) => time >= start && time < start + span - 0.3).length;
      if (count > best.count) best = { start, count };
    }
    return { start: best.start, end: Math.min(total, best.start + span), fillers: best.count };
  }
  function editPreviewRange(words, range, editedDuration) {
    const cuts = words.filter((word) => word.f ?? word.filler).map((word) => ({
      start: Math.max(0, Number(word.s ?? word.start) - 0.03), end: Number(word.e ?? word.end) + 0.03,
    })).sort((a, b) => a.start - b.start);
    const mapTime = (time) => {
      let removed = 0, cursor = 0;
      for (const cut of cuts) {
        const from = Math.max(cursor, cut.start), to = Math.min(time, cut.end);
        removed += Math.max(0, to - from); cursor = Math.max(cursor, cut.end);
      }
      return Math.max(0, time - removed);
    };
    const total = Math.max(0, Number(editedDuration) || 0);
    const start = Math.min(mapTime(range.start), Math.max(0, total - 0.1));
    return { start, end: Math.min(total, Math.max(start, mapTime(range.end))) };
  }
  function storySeconds(words, duration, burpSeconds = 0, eatFirst = false) {
    const fillers = words.filter((word) => word.f ?? word.filler);
    const eating = fillers.reduce((seconds, word, index) => seconds + (index < 2 ? 1 : 0.36) + Math.max(index < 2 ? 1 : 0.65, Number(word.e ?? word.end) - Number(word.s ?? word.start) + 0.08), 0);
    const preview = Math.min(5, Number(duration) || 0);
    return Math.ceil(((eatFirst ? 0 : preview) + 1.5 + eating + Math.min(5, burpSeconds) + 7 + preview * 2 + 5) / 5) * 5;
  }
  const exports = { createTakeController, audioMime, audioExtension, previewRange, abRange, editPreviewRange, storySeconds };
  if (typeof module !== 'undefined') module.exports = exports;
  else root.UGTake = exports;
})(globalThis);
