/* Local-only demo hooks. Replace these bodies when wiring recording, audio, or analysis. */
function playAudio(kind) {
  const buttons = [...document.querySelectorAll("[data-audio-kind]")];
  const active = buttons.find((button) => button.dataset.audioKind === kind);
  if (!active) return;
  buttons.forEach((button) => {
    button.classList.remove("ug-audio-playing");
    button.setAttribute("aria-pressed", "false");
    const icon = button.querySelector(".ug-audio-play");
    if (icon) icon.textContent = "▶";
  });
  active.classList.add("ug-audio-playing");
  active.setAttribute("aria-pressed", "true");
  const activeIcon = active.querySelector(".ug-audio-play");
  if (activeIcon) activeIcon.textContent = "Ⅱ";
  window.setTimeout(() => {
    active.classList.remove("ug-audio-playing");
    active.setAttribute("aria-pressed", "false");
    if (activeIcon) activeIcon.textContent = "▶";
  }, Number(window.UG_DATA?.demo?.audioPreviewMs) || 900);
}

function startRecording() {
  if (state.recordingInterval) window.clearInterval(state.recordingInterval);
  state.try.runId += 1;
  state.try.uploadName = "";
  state.try.remaining = Number(window.UG_DATA.demo.recordLimitSec);
  state.try.status = "recording";
  state.try.error = "";
  renderTryIntoPage();
  state.recordingInterval = window.setInterval(() => {
    state.try.remaining = Math.max(0, state.try.remaining - 1);
    updateRecordingTimer();
    if (state.try.remaining <= 0) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (state.recordingInterval) window.clearInterval(state.recordingInterval);
  state.recordingInterval = null;
  if (state.try.status !== "recording") return;
  state.try.status = "analyzing";
  renderTryIntoPage();
  const runId = ++state.try.runId;
  window.setTimeout(() => {
    if (state.try.runId !== runId) return;
    state.try.status = "result";
    renderTryIntoPage();
  }, Number(window.UG_DATA.demo.analysisPreviewMs) || 720);
}

function analyzeUpload(file) {
  if (state.recordingInterval) window.clearInterval(state.recordingInterval);
  state.recordingInterval = null;
  if (!file) {
    showTryError("No file was selected. Choose an audio file and try again.");
    return;
  }
  if (!file.type.startsWith("audio/")) {
    showTryError("That file does not look like audio. Choose an audio file to continue.");
    return;
  }
  state.try.runId += 1;
  state.try.uploadName = file.name;
  state.try.remaining = Number(window.UG_DATA.demo.recordLimitSec);
  state.try.status = "analyzing";
  state.try.error = "";
  renderTryIntoPage();
  const runId = state.try.runId;
  window.setTimeout(() => {
    if (state.try.runId !== runId) return;
    state.try.status = "result";
    renderTryIntoPage();
  }, Number(window.UG_DATA.demo.analysisPreviewMs) || 720);
}

function showTryError(message) {
  if (state.recordingInterval) window.clearInterval(state.recordingInterval);
  state.recordingInterval = null;
  state.try.runId += 1;
  state.try.status = "error";
  state.try.error = message;
  renderTryIntoPage();
}

window.UG_DATA = {
  sample: {
    title: "A real recorded answer",
    speaker: "Astronaut press conference (NASA, public domain)",
    question: "What does an all-female spacewalk mean to you?",
    durationSec: 25.9
  },
  take: {
    fillers: 9,
    spokenWords: 62,
    per100: 14.5,
    covered: true,
    verdict: "fed",
    words: [
      { t: "Yeah.", s: 0.0, e: 0.48, f: false },
      { t: "As", s: 0.48, e: 0.64, f: false },
      { t: "as", s: 0.64, e: 1.12, f: false },
      { t: "much", s: 1.12, e: 1.36, f: false },
      { t: "as,", s: 1.36, e: 1.68, f: false },
      { t: "um,", s: 1.68, e: 1.92, f: true },
      { t: "it's", s: 1.92, e: 2.32, f: false },
      { t: "worth", s: 2.32, e: 2.64, f: false },
      { t: "celebrating,", s: 2.64, e: 3.84, f: false },
      { t: "uh,", s: 3.84, e: 4.32, f: true },
      { t: "the", s: 4.32, e: 4.64, f: false },
      { t: "first,", s: 4.64, e: 5.12, f: false },
      { t: "uh,", s: 5.12, e: 5.36, f: true },
      { t: "spacewalk,", s: 5.36, e: 6.16, f: false },
      { t: "um,", s: 6.16, e: 6.4, f: true },
      { t: "with", s: 6.4, e: 6.64, f: false },
      { t: "an", s: 6.64, e: 6.8, f: false },
      { t: "all", s: 6.8, e: 7.04, f: false },
      { t: "female", s: 7.04, e: 7.36, f: false },
      { t: "team,", s: 7.36, e: 8.0, f: false },
      { t: "um,", s: 8.16, e: 8.4, f: true },
      { t: "I", s: 8.4, e: 8.72, f: false },
      { t: "think", s: 8.72, e: 8.88, f: false },
      { t: "many", s: 8.88, e: 9.2, f: false },
      { t: "of", s: 9.2, e: 9.36, f: false },
      { t: "us", s: 9.36, e: 9.6, f: false },
      { t: "are", s: 9.6, e: 10.24, f: false },
      { t: "looking", s: 10.24, e: 10.56, f: false },
      { t: "forward", s: 10.56, e: 10.8, f: false },
      { t: "to", s: 10.8, e: 10.96, f: false },
      { t: "it", s: 10.96, e: 11.12, f: false },
      { t: "just", s: 11.12, e: 11.36, f: false },
      { t: "being", s: 11.36, e: 11.84, f: false },
      { t: "normal.", s: 11.84, e: 12.32, f: false },
      { t: "And,", s: 12.76, e: 13.24, f: false },
      { t: "um,", s: 13.24, e: 13.8, f: true },
      { t: "I", s: 13.88, e: 14.12, f: false },
      { t: "think", s: 14.12, e: 14.29, f: false },
      { t: "if", s: 14.29, e: 14.45, f: false },
      { t: "it", s: 14.45, e: 14.61, f: false },
      { t: "signifies", s: 14.61, e: 15.08, f: false },
      { t: "anything,", s: 15.08, e: 15.8, f: false },
      { t: "it", s: 15.8, e: 16.05, f: false },
      { t: "is,", s: 16.05, e: 16.36, f: false },
      { t: "uh,", s: 16.36, e: 16.68, f: true },
      { t: "to", s: 16.68, e: 17.09, f: false },
      { t: "honor", s: 17.09, e: 17.4, f: false },
      { t: "the", s: 17.4, e: 17.64, f: false },
      { t: "the", s: 17.64, e: 17.8, f: false },
      { t: "women", s: 17.8, e: 18.05, f: false },
      { t: "who", s: 18.05, e: 18.29, f: false },
      { t: "came", s: 18.29, e: 18.45, f: false },
      { t: "before", s: 18.45, e: 18.77, f: false },
      { t: "us", s: 18.77, e: 19.32, f: false },
      { t: "who,", s: 19.4, e: 19.96, f: false },
      { t: "um,", s: 19.96, e: 20.12, f: true },
      { t: "were", s: 20.12, e: 20.52, f: false },
      { t: "skilled", s: 20.52, e: 20.84, f: false },
      { t: "and", s: 20.84, e: 21.16, f: false },
      { t: "qualified,", s: 21.16, e: 22.04, f: false },
      { t: "um,", s: 22.04, e: 22.29, f: true },
      { t: "and", s: 22.29, e: 22.61, f: false },
      { t: "didn't", s: 22.61, e: 22.93, f: false },
      { t: "get", s: 22.93, e: 23.16, f: false },
      { t: "the", s: 23.16, e: 23.4, f: false },
      { t: "same", s: 23.4, e: 23.96, f: false },
      { t: "opportunities", s: 23.96, e: 24.45, f: false },
      { t: "that", s: 24.45, e: 24.68, f: false },
      { t: "we", s: 24.68, e: 24.84, f: false },
      { t: "have", s: 24.84, e: 25.0, f: false },
      { t: "today.", s: 25.0, e: 25.32, f: false }
    ],
    coach: {
      habit: "You toss in an “um” right in the middle of a phrase.",
      drill: "Pause for one silent beat whenever a second “um” arrives within ten seconds.",
      goblinLine: "Um, feed me those ums; I’m starving for chatter!"
    },
    timings: { deepgramMs: 518, coachMs: 2189 }
  },
  edit: {
    passes: [
      { pass: 0, fillers: 9, duration: 25.9 },
      { pass: 1, fillers: 2, duration: 23.2 },
      { pass: 2, fillers: 0, duration: 22.8 }
    ],
    label: "Edited by the goblin — not a real second attempt. It shows the target; you still have to say it."
  },
  judge: {
    gate: { status: 404, message: "no deepgram connection configured for this organization" },
    measured: [
      ["um/uh detected on the real NASA clip", "9", "REAL"],
      ["Goblin edit re-checked by Deepgram", "9 → 2 → 0 in 2 passes", "REAL"],
      ["Synthetic TTS voices (6 voices × 2 tries)", "fillers mostly not detected — why the demo uses a real recording", "REAL finding"],
      ["11 real podcast clips (NASA + HPR): words lost by the cutter", "2 / 11", "REAL"],
      ["Planted missing word caught by the checker", "8 / 11", "REAL"]
    ],
    sprite: { wokeSecondsAgo: 4, previousVisit: "3 h ago", attemptsInLair: 12, keysOnSprite: 0 }
  },
  demo: {
    storyTeaserSec: 90,
    tryTeaserMin: 1,
    recordLimitSec: 90,
    snackStaggerMs: 250,
    snackFlightMs: 480,
    scenePauseMs: 420,
    passDurationMs: 640,
    analysisPreviewMs: 720,
    audioPreviewMs: 900
  },
  ui: {
    heroEyebrow: "A tiny speaking practice with a big appetite",
    heroTitleBefore: "Every",
    heroHighlight: "“um”",
    heroTitleAfter: "you say feeds a goblin.",
    heroSubtitle: "Practice until it starves.",
    heroCaption: "A real answer. A very hungry goblin.",
    playStoryLabel: "Play the story",
    silenceVerdict: "Silence isn’t a win — you skipped the answer.",
    sceneNames: ["The answer", "What the coach noticed", "Hear yourself without the ums", "Now you try"]
  }
};

const state = {
  story: { eaten: 0, playing: false, runId: 0 },
  edit: { passIndex: 0, playing: false, runId: 0 },
  try: { status: "idle", remaining: 0, error: "", uploadName: "", runId: 0 },
  recordingInterval: null,
  toastTimer: null,
  lastFocus: null
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const numberValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatSeconds = (seconds) => `${Math.floor(numberValue(seconds) / 60)}:${String(Math.floor(numberValue(seconds) % 60)).padStart(2, "0")}`;
const formatTimestamp = (seconds) => `${Math.floor(numberValue(seconds) / 60)}:${(numberValue(seconds) % 60).toFixed(1).padStart(4, "0")}`;
const formatDurationLabel = (seconds) => `${numberValue(seconds).toFixed(1)}s`;
const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function goblinMarkup(mouthId, moodClass = "") {
  return `<span class="ug-goblin-art ${escapeHTML(moodClass)}" aria-hidden="true"><svg viewBox="0 0 260 265" role="presentation" class="ug-goblin-svg"><path class="ug-ear" d="M60 76 16 46l10 66 39-9M200 76l44-30-10 66-39-9"/><path class="ug-ear-inner" d="m53 76-22-16 6 31m170-15 22-16-6 31"/><path class="ug-goblin-body" d="M51 111c4-43 34-72 79-72s75 29 79 72l9 77c3 34-27 58-88 58s-91-24-88-58z"/><path class="ug-brow" d="m77 111 29-8m48 0 29 8"/><ellipse class="ug-eye" cx="98" cy="127" rx="8" ry="12"/><ellipse class="ug-eye" cx="162" cy="127" rx="8" ry="12"/><circle class="ug-eye-glint" cx="100" cy="123" r="2.3"/><circle class="ug-eye-glint" cx="164" cy="123" r="2.3"/><path class="ug-nose" d="m123 141 7 6 7-6"/><path class="ug-mouth" id="${escapeHTML(mouthId)}" d="M106 164q24 24 48 0"/><path class="ug-tooth" d="m119 173 5 8 5-5 5 5 6-8"/><path class="ug-cheek" d="M74 157q9 7 16 1m80-1q8 6 16-1"/><path class="ug-tummy" d="M77 199q53-25 106 0"/><path class="ug-foot" d="M78 237q-5 13 14 13h26l-8-14m61 1-8 13h26q19 0 14-13"/><path class="ug-spot" d="m64 91 4-7 4 7m112 8 4-7 4 7m-58-40 4-7 4 7"/></svg></span>`;
}

function renderHero(data) {
  return `<p class="ug-eyebrow"><span class="ug-eyebrow-dot"></span>${escapeHTML(data.ui.heroEyebrow)}</p><h1 id="ug-hero-title">${escapeHTML(data.ui.heroTitleBefore)} <span class="ug-headline-mark">${escapeHTML(data.ui.heroHighlight)}</span> ${escapeHTML(data.ui.heroTitleAfter)}</h1><p class="ug-hero-subtitle">${escapeHTML(data.ui.heroSubtitle)}</p><div class="ug-hero-actions"><button class="ug-button ug-button-primary" type="button" data-action="play-story"><span class="ug-play-icon" aria-hidden="true">▶</span> ${escapeHTML(data.ui.playStoryLabel)}</button><span class="ug-hero-caption">${escapeHTML(data.ui.heroCaption)}</span></div>`;
}

function renderEntryCards(data) {
  return `<a class="ug-entry-card ug-entry-card-active" href="#ug-scene-take" data-view="story"><span class="ug-entry-title"><span>Watch the story · ${escapeHTML(data.demo.storyTeaserSec)} sec · real human</span><span aria-hidden="true">↗</span></span><span class="ug-entry-meta">A real answer takes center stage.</span></a><a class="ug-entry-card" href="#ug-scene-try" data-view="try"><span class="ug-entry-title"><span>Try it yourself · ${escapeHTML(data.demo.tryTeaserMin)} min · your voice</span><span aria-hidden="true">↗</span></span><span class="ug-entry-meta">Same question. Your own practice space.</span></a><a class="ug-entry-card ug-entry-card-judge" href="#ug-judge-drawer" data-view="judge" data-action="open-judge"><span class="ug-entry-title"><span>I’m a judge · proof &amp; plumbing</span><span aria-hidden="true">↗</span></span><span class="ug-entry-meta">What it measures, remembers, and misses.</span></a>`;
}

function renderWave(words, duration, options = {}) {
  const totalDuration = Math.max(0.1, numberValue(duration));
  const keepMarkers = options.markers !== false;
  const keptFillers = options.keepFillers;
  const entries = words.map((word, index) => ({ ...word, index })).filter((word) => !options.omitFillers || !word.f || keptFillers?.has(word.index));
  const removedBefore = new Map();
  let removedDuration = 0;
  const visible = [];
  words.forEach((word, index) => {
    removedBefore.set(index, removedDuration);
    if (options.omitFillers && word.f && !keptFillers?.has(index)) removedDuration += Math.max(0, numberValue(word.e) - numberValue(word.s));
    else visible.push({ ...word, index });
  });
  const residualDuration = Math.max(0.1, numberValue(words.at(-1)?.e) - removedDuration);
  const scale = options.omitFillers ? totalDuration / residualDuration : 1;
  const plotWords = options.omitFillers ? visible : entries;
  const segments = plotWords.map((word, index) => {
    const shift = options.omitFillers ? (removedBefore.get(word.index) || 0) : 0;
    const start = Math.max(0, (numberValue(word.s) - shift) * scale);
    const end = Math.max(start + 0.03, (numberValue(word.e) - shift) * scale);
    const center = Math.min(99.8, Math.max(0.1, ((start + end) / 2 / totalDuration) * 100));
    const left = Math.min(99.8, Math.max(0, (start / totalDuration) * 100));
    const width = Math.max(0.14, ((end - start) / totalDuration) * 100);
    const height = 18 + ((word.index * 17 + String(word.t).length * 11) % 34);
    const opacity = word.f ? 0.94 : 0.57 + ((word.index % 4) * 0.09);
    return `<span class="ug-wave-segment${word.f ? " ug-wave-filler" : ""}" style="--ug-wave-left:${left.toFixed(3)}%;--ug-wave-width:${width.toFixed(3)}%;--ug-wave-height:${height}px;--ug-wave-opacity:${opacity.toFixed(2)}" aria-hidden="true"></span>${keepMarkers && word.f ? `<button class="ug-filler-marker" type="button" data-word-index="${word.index}" data-timestamp="${numberValue(word.s).toFixed(2)}" title="${escapeHTML(word.t)} at ${formatTimestamp(word.s)}" aria-label="Filler ${escapeHTML(word.t)} at ${formatTimestamp(word.s)}" style="--ug-wave-left:${center.toFixed(3)}%"></button>` : ""}`;
  }).join("");
  return `<div class="ug-wave${options.edit ? " ug-wave-edit" : ""}" role="img" aria-label="Audio waveform${options.label ? `, ${escapeHTML(options.label)}` : ""}">${segments}</div>`;
}

function renderTake(data) {
  const sample = data.sample;
  const take = data.take;
  const words = take.words || [];
  const transcript = words.map((word, index) => word.f
    ? `<button class="ug-transcript-word ug-is-filler" type="button" data-word-index="${index}" data-timestamp="${numberValue(word.s).toFixed(2)}" title="${formatTimestamp(word.s)}–${formatTimestamp(word.e)}" aria-label="${escapeHTML(word.t)} at ${formatTimestamp(word.s)}">${escapeHTML(word.t)}</button>`
    : `<span class="ug-transcript-word">${escapeHTML(word.t)}</span>`).join(" ");
  return `<div class="ug-sample-head"><div><h4 class="ug-sample-title">${escapeHTML(sample.title)}</h4><p class="ug-sample-speaker">${escapeHTML(sample.speaker)}</p></div><span class="ug-sample-duration">${formatDurationLabel(sample.durationSec)}</span></div><div class="ug-question-box">“${escapeHTML(sample.question)}”</div><div class="ug-wave-card"><div class="ug-wave-header"><span class="ug-wave-label">Original answer · ${escapeHTML(take.spokenWords)} words</span><span class="ug-wave-legend"><i class="ug-wave-legend-dot"></i> filler words</span></div><div id="ug-take-wave">${renderWave(words, sample.durationSec, { markers: true, label: "Original answer" })}</div><div class="ug-wave-scale"><span>00:00</span><span>${formatDurationLabel(sample.durationSec)}</span></div></div><div class="ug-take-bottom"><div><p class="ug-transcript-label"><span>Transcript</span><span class="ug-transcript-help">Tap a highlighted word for its timestamp</span></p><p class="ug-transcript">${transcript}</p></div><div class="ug-take-stats"><div class="ug-stat-box"><span class="ug-stat-value" id="ug-eaten-counter" aria-live="polite">0</span><span class="ug-stat-label">fillers eaten</span></div><div class="ug-stat-box"><span class="ug-stat-value" id="ug-per100-counter" aria-live="polite">0.0</span><span class="ug-stat-label">fillers per 100 words</span></div></div></div><div class="ug-goblin-quip">${goblinMarkup("ug-snack-mouth", "ug-goblin-snack") }<div class="ug-quip-bubble" id="ug-take-bubble" hidden aria-live="polite">${escapeHTML(take.coach.goblinLine)}</div></div>`;
}

function renderCoach(data) {
  const coach = data.take.coach;
  const connectorSeconds = (numberValue(data.take.timings.coachMs) / 1000).toFixed(1);
  const covered = data.take.covered
    ? `<span class="ug-chip-good" aria-label="yes">✓</span><strong>Yes</strong>`
    : `<span class="ug-chip-good" aria-label="no" style="color:var(--ug-blocked)">×</span><strong>No</strong>`;
  return `<div class="ug-coach-layout"><div class="ug-coach-note"><span class="ug-note-label">Habit</span><h4>One tiny pattern</h4><p>${escapeHTML(coach.habit)}</p><span class="ug-coach-source">Coach via OpenRouter connector · ${escapeHTML(connectorSeconds)} s</span></div><div class="ug-coach-note"><span class="ug-note-label">Next drill</span><h4>Try this on your next answer</h4><p>${escapeHTML(coach.drill)}</p></div></div><div class="ug-stat-chips"><span class="ug-stat-chip">Fillers <strong>${escapeHTML(data.take.fillers)}</strong></span><span class="ug-stat-chip">Per 100 words <strong>${escapeHTML(data.take.per100)}</strong></span><span class="ug-stat-chip">Answer covered ${covered}</span></div>`;
}

function renderEdit(data) {
  const passes = data.edit.passes || [];
  const first = passes[0] || { fillers: 0, duration: data.sample.durationSec };
  const allFillerIndexes = data.take.words.map((word, index) => word.f ? index : -1).filter((index) => index >= 0);
  const initialKeep = new Set(allFillerIndexes.slice(0, numberValue(first.fillers)));
  const passCards = passes.map((pass, index) => `<div class="ug-pass-step${index === 0 ? " ug-pass-active" : ""}" data-pass-step="${index}"><strong>Pass ${escapeHTML(pass.pass)} · <span class="ug-pass-filler-count">${escapeHTML(pass.fillers)} fillers</span></strong><span>re-checked by Deepgram</span></div>`).join("");
  return `<div class="ug-edit-intro"><p>The goblin snips its favorite sounds, then a checker takes another listen. Watch the edit tighten up pass by pass.</p><button class="ug-button ug-button-primary ug-edit-play" type="button" data-action="play-edit"><span class="ug-play-icon" aria-hidden="true">▶</span> Play the edit</button></div><div class="ug-edit-wave-grid"><div class="ug-edit-wave-card"><div class="ug-edit-wave-head"><strong>Original</strong><span class="ug-edit-duration">${formatDurationLabel(data.sample.durationSec)}</span></div>${renderWave(data.take.words, data.sample.durationSec, { markers: false, label: "Original" })}</div><div class="ug-edit-wave-card"><div class="ug-edit-wave-head"><strong>Goblin edit</strong><span class="ug-edit-duration" id="ug-edit-duration">${formatDurationLabel(first.duration)}</span></div><div id="ug-edit-wave">${renderWave(data.take.words, first.duration, { markers: false, edit: true, omitFillers: true, keepFillers: initialKeep, label: "Goblin edit" })}</div></div></div><div class="ug-pass-row" id="ug-pass-row">${passCards}</div><div class="ug-audio-row"><button class="ug-audio-button" type="button" data-audio-kind="original" aria-pressed="false"><span class="ug-audio-play" aria-hidden="true">▶</span><span class="ug-audio-copy"><strong>Hear the original</strong><small>Audio preview placeholder</small></span></button><button class="ug-audio-button" type="button" data-audio-kind="edit" aria-pressed="false"><span class="ug-audio-play" aria-hidden="true">▶</span><span class="ug-audio-copy"><strong>Hear the goblin edit</strong><small>Audio preview placeholder</small></span></button></div><p class="ug-edit-honesty">${escapeHTML(data.edit.label)}</p><div class="ug-edit-mood">${goblinMarkup("ug-edit-mouth", "ug-goblin-hungry")}<span>Looks like the goblin is already thinking about your next answer.</span></div>`;
}

function renderTry(data, tryState = { status: "idle", remaining: numberValue(data.demo.recordLimitSec) }) {
  const limit = numberValue(data.demo.recordLimitSec);
  const remaining = tryState.status === "idle" ? limit : Math.max(0, numberValue(tryState.remaining));
  const progress = limit ? (remaining / limit) * 100 : 100;
  const recording = tryState.status === "recording";
  const isAnalyzing = tryState.status === "analyzing";
  const buttonText = recording ? "Stop demo take" : tryState.status === "idle" ? "Start a practice take" : "Try recording again";
  let stateContent = "";
  if (recording) stateContent = `<div class="ug-try-state"><span class="ug-try-state-icon">●</span><div class="ug-try-state-copy"><strong>Recording preview</strong><p>Timer is running locally. No microphone or audio is connected in this static demo.</p></div></div>`;
  if (isAnalyzing) stateContent = `<div class="ug-try-state ug-state-analyzing" role="status"><span class="ug-try-state-icon">…</span><div class="ug-try-state-copy"><strong>Analyzing the demo flow</strong><p>${tryState.uploadName ? `Selected file: ${escapeHTML(tryState.uploadName)}. ` : ""}This is a local placeholder; no audio is uploaded.</p></div></div>`;
  if (tryState.status === "result") stateContent = `<div class="ug-try-state" role="status"><span class="ug-try-state-icon">✓</span><div class="ug-try-state-copy"><strong>Practice flow complete</strong><p>No audio was captured or scored. Connect the demo hooks to evaluate a real take.</p></div></div>`;
  if (tryState.status === "error") stateContent = `<div class="ug-try-state ug-state-error" role="alert"><span class="ug-try-state-icon">!</span><div class="ug-try-state-copy"><strong>Couldn’t finish that take</strong><p>${escapeHTML(tryState.error || "The demo hook returned an error.")}</p></div></div>`;
  return `<div class="ug-try-layout"><div><p class="ug-try-question">${escapeHTML(data.sample.question)}</p><p class="ug-try-instruction">Take a breath, then answer in your own words. You have ${escapeHTML(limit)} seconds.</p><div class="ug-try-actions"><button class="ug-record-button${recording ? " ug-recording" : ""}" type="button" data-action="record" aria-label="${escapeHTML(buttonText)}" style="--ug-ring-progress:${progress.toFixed(1)}%" ${isAnalyzing ? "disabled" : ""}><span class="ug-record-core"><strong id="ug-record-time">${formatSeconds(remaining)}</strong><small>${recording ? "recording" : "limit"}</small></span></button><div class="ug-try-utility"><label class="ug-upload-label" for="ug-audio-upload">Upload an audio file</label><input class="ug-upload-input" id="ug-audio-upload" type="file" accept="audio/*" aria-label="Choose an audio file"/><button class="ug-text-button" type="button" data-action="silence">What if I stay silent?</button></div></div><p class="ug-try-disclaimer"><span class="ug-privacy-icon" aria-hidden="true">◈</span>Your recordings stay on your own Sprite.</p><button class="ug-try-error-test" type="button" data-action="simulate-error">Show the error state</button></div><div><div id="ug-try-state-area">${stateContent}</div><div class="ug-try-state${tryState.status === "idle" ? "" : ""}" id="ug-try-idle-note" ${tryState.status === "idle" ? "" : "hidden"}><span class="ug-try-state-icon">i</span><div class="ug-try-state-copy"><strong>A safe little demo</strong><p>Recording, analysis, and upload are simulated. Nothing leaves this page.</p></div></div></div></div>`;
}

function renderJudge(data) {
  const sprite = data.judge.sprite;
  const measured = data.judge.measured || [];
  const rows = measured.map(([label, value, badge]) => `<tr><td>${escapeHTML(label)}</td><td>${escapeHTML(value)}</td><td><span class="ug-real-pill${badge === "REAL finding" ? " ug-real-finding" : ""}">${escapeHTML(badge)}</span></td></tr>`).join("");
  return `<section class="ug-judge-card"><h3>No connector, no goblin</h3><p>The coach gate blocks cleanly when there is no Deepgram connection available.</p><button class="ug-button ug-button-blocked" type="button" data-action="test-gate">Test the gate <span aria-hidden="true">↗</span></button><div class="ug-gate-error" id="ug-gate-error" hidden role="status"><strong class="ug-gate-status" id="ug-gate-status"></strong><span id="ug-gate-message"></span></div></section><section class="ug-judge-card"><h3>The lair remembers</h3><p>A small, inspectable Sprite footprint for this request.</p><div class="ug-sprite-facts"><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.wokeSecondsAgo)}s</strong><span>woke ago on your request</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.previousVisit)}</strong><span>previous visit</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.attemptsInLair)}</strong><span>attempts in this lair</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.keysOnSprite)}</strong><span>API keys on the Sprite</span></div></div></section><section class="ug-judge-card"><h3>What it catches (and what it misses)</h3><p>Evidence from the demo’s real clip checks and cutter tests.</p><div class="ug-measured-wrap"><table class="ug-measured-table"><thead><tr><th>Finding</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div><a class="ug-readme-link" href="#ug-readme-note" data-action="readme">Read the README</a><div class="ug-readme-note" id="ug-readme-note" hidden><p>This is a static, local-only UI demo. The recording, audio-player, and analysis hooks are intentionally placeholders; the judge panel displays the supplied sample evidence and connector-gate response.</p></div></section>`;
}

window.renderTake = renderTake;
window.renderEdit = renderEdit;
window.renderJudge = renderJudge;
window.playAudio = playAudio;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.analyzeUpload = analyzeUpload;

function renderTryIntoPage() {
  const mount = document.getElementById("ug-try-content");
  if (mount) mount.innerHTML = renderTry(window.UG_DATA, state.try);
}

function applyData() {
  const data = window.UG_DATA;
  document.title = `Um Goblin — ${data.ui.heroSubtitle}`;
  document.getElementById("ug-hero-copy").innerHTML = renderHero(data);
  document.getElementById("ug-take-title").textContent = data.ui.sceneNames[0];
  document.getElementById("ug-coach-title").textContent = data.ui.sceneNames[1];
  document.getElementById("ug-edit-title").textContent = data.ui.sceneNames[2];
  document.getElementById("ug-try-title").textContent = data.ui.sceneNames[3];
  const entryCards = document.getElementById("ug-entry-cards");
  if (entryCards) entryCards.innerHTML = renderEntryCards(data);
  document.getElementById("ug-take-content").innerHTML = renderTake(data);
  document.getElementById("ug-coach-content").innerHTML = renderCoach(data);
  document.getElementById("ug-edit-content").innerHTML = renderEdit(data);
  document.getElementById("ug-try-content").innerHTML = renderTry(data, state.try);
  document.getElementById("ug-judge-content").innerHTML = renderJudge(data);
  document.querySelectorAll("[data-scene-number]").forEach((element) => {
    const index = numberValue(element.dataset.sceneNumber);
    element.textContent = String(index + 1).padStart(2, "0");
  });
  document.getElementById("ug-story-time").textContent = `About ${data.demo.storyTeaserSec} sec`;
}

function showToast(message) {
  const toast = document.getElementById("ug-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("ug-toast-visible");
  if (state.toastTimer) window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("ug-toast-visible"), 2200);
}

function scrollToElement(selector) {
  document.querySelector(selector)?.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
}

function setCounterValues(eaten, rate) {
  const eatenNode = document.getElementById("ug-eaten-counter");
  const rateNode = document.getElementById("ug-per100-counter");
  if (eatenNode) eatenNode.textContent = String(eaten);
  if (rateNode) rateNode.textContent = Number(rate).toFixed(1);
}

function resetTakeVisuals() {
  state.story.eaten = 0;
  document.querySelectorAll(".ug-filler-marker").forEach((marker) => marker.classList.remove("ug-marker-eaten"));
  document.getElementById("ug-hero-goblin")?.classList.remove("ug-is-fed");
  const hero = document.getElementById("ug-hero-goblin");
  if (hero) hero.style.removeProperty("--ug-fed-scale");
  document.getElementById("ug-take-bubble")?.setAttribute("hidden", "");
  setCounterValues(0, 0);
}

function flySnack(marker, mouth) {
  if (reducedMotion.matches || !marker || !mouth || typeof marker.animate !== "function") return;
  const from = marker.getBoundingClientRect();
  const to = mouth.getBoundingClientRect();
  const snack = document.createElement("span");
  snack.className = "ug-fly-snack";
  snack.style.left = `${from.left + from.width / 2 - 6}px`;
  snack.style.top = `${from.top + from.height / 2 - 6}px`;
  document.body.appendChild(snack);
  const dx = to.left + to.width / 2 - from.left - from.width / 2;
  const dy = to.top + to.height / 2 - from.top - from.height / 2;
  const animation = snack.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.65}px, ${dy * 0.72 - 28}px) scale(1.18)`, opacity: 1, offset: 0.72 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 }
  ], { duration: numberValue(window.UG_DATA.demo.snackFlightMs), easing: "cubic-bezier(.2,.8,.2,1)" });
  animation.finished.then(() => snack.remove()).catch(() => snack.remove());
}

async function animateTake(runId) {
  resetTakeVisuals();
  const data = window.UG_DATA;
  const markers = [...document.querySelectorAll(".ug-filler-marker")];
  const total = numberValue(data.take.fillers);
  const hero = document.getElementById("ug-hero-goblin");
  const mouth = document.getElementById("ug-hero-mouth");
  if (reducedMotion.matches) {
    markers.forEach((marker) => marker.classList.add("ug-marker-eaten"));
    state.story.eaten = total;
    setCounterValues(total, data.take.per100);
    if (hero) {
      hero.classList.add("ug-is-fed");
      hero.style.setProperty("--ug-fed-scale", "1.2");
    }
    document.getElementById("ug-take-bubble")?.removeAttribute("hidden");
    return;
  }
  for (let index = 0; index < markers.length; index += 1) {
    if (state.story.runId !== runId) return;
    const marker = markers[index];
    flySnack(marker, mouth);
    marker.classList.add("ug-marker-eaten");
    state.story.eaten = Math.min(total, index + 1);
    const ratio = total ? state.story.eaten / total : 1;
    const rate = numberValue(data.take.per100) * ratio;
    setCounterValues(state.story.eaten, rate);
    if (hero) {
      hero.classList.add("ug-is-fed");
      hero.style.setProperty("--ug-fed-scale", (1 + ratio * 0.2).toFixed(3));
    }
    await wait(numberValue(data.demo.snackStaggerMs));
  }
  if (state.story.runId !== runId) return;
  setCounterValues(total, data.take.per100);
  document.getElementById("ug-take-bubble")?.removeAttribute("hidden");
}

function compressedWaveWords(data, passIndex) {
  const pass = data.edit.passes[passIndex];
  const fillerIndexes = data.take.words.map((word, index) => word.f ? index : -1).filter((index) => index >= 0);
  const keepFillers = new Set(fillerIndexes.slice(0, numberValue(pass.fillers)));
  return { pass, keepFillers };
}

function updateEditPass(passIndex) {
  const data = window.UG_DATA;
  const details = compressedWaveWords(data, passIndex);
  const target = document.getElementById("ug-edit-wave");
  const duration = document.getElementById("ug-edit-duration");
  if (!target || !details.pass) return;
  target.innerHTML = renderWave(data.take.words, details.pass.duration, { markers: false, edit: true, omitFillers: true, keepFillers: details.keepFillers, label: "Goblin edit" });
  target.querySelector(".ug-wave")?.classList.add("ug-wave-animate");
  if (duration) duration.textContent = formatDurationLabel(details.pass.duration);
  document.querySelectorAll("[data-pass-step]").forEach((step) => {
    step.classList.toggle("ug-pass-active", numberValue(step.dataset.passStep) === passIndex);
  });
  state.edit.passIndex = passIndex;
}

async function animateEdit(runId) {
  const passes = window.UG_DATA.edit.passes || [];
  if (!passes.length) return;
  state.edit.playing = true;
  if (reducedMotion.matches) {
    updateEditPass(passes.length - 1);
    state.edit.playing = false;
    return;
  }
  for (let index = 0; index < passes.length; index += 1) {
    if (state.edit.runId !== runId) return;
    updateEditPass(index);
    await wait(numberValue(window.UG_DATA.demo.passDurationMs));
  }
  state.edit.playing = false;
}

async function playStory() {
  if (state.story.playing) return;
  state.story.playing = true;
  const runId = ++state.story.runId;
  state.edit.runId += 1;
  state.edit.playing = false;
  resetTakeVisuals();
  updateEditPass(0);
  scrollToElement("#ug-scene-take");
  await animateTake(runId);
  if (state.story.runId !== runId) return;
  if (reducedMotion.matches) {
    updateEditPass(window.UG_DATA.edit.passes.length - 1);
    state.story.playing = false;
    return;
  }
  await wait(numberValue(window.UG_DATA.demo.scenePauseMs));
  scrollToElement("#ug-scene-coach");
  if (!reducedMotion.matches) await wait(numberValue(window.UG_DATA.demo.scenePauseMs));
  scrollToElement("#ug-scene-edit");
  const editRunId = ++state.edit.runId;
  await animateEdit(editRunId);
  state.story.playing = false;
}

function playEdit() {
  if (state.edit.playing) return;
  const runId = ++state.edit.runId;
  scrollToElement("#ug-scene-edit");
  animateEdit(runId);
}

function updateRecordingTimer() {
  const limit = numberValue(window.UG_DATA.demo.recordLimitSec);
  const time = document.getElementById("ug-record-time");
  const button = document.querySelector(".ug-record-button");
  if (time) time.textContent = formatSeconds(state.try.remaining);
  if (button) button.style.setProperty("--ug-ring-progress", `${limit ? (state.try.remaining / limit) * 100 : 0}%`);
}

function openJudge() {
  const drawer = document.getElementById("ug-judge-drawer");
  if (!drawer) return;
  state.lastFocus = document.activeElement;
  drawer.hidden = false;
  document.body.classList.add("ug-drawer-open");
  drawer.querySelector("button[data-action='close-judge']")?.focus();
}

function closeJudge() {
  const drawer = document.getElementById("ug-judge-drawer");
  if (!drawer) return;
  drawer.hidden = true;
  document.body.classList.remove("ug-drawer-open");
  state.lastFocus?.focus?.();
}

function showSilenceResult() {
  const target = document.getElementById("ug-silence-result");
  if (!target) return;
  target.innerHTML = `<span class="ug-blocked-icon" aria-hidden="true">⊘</span><span>${escapeHTML(window.UG_DATA.ui.silenceVerdict)} The goblin does not shrink.</span>${goblinMarkup("ug-silence-mouth", "ug-goblin-stays-put")}`;
  target.hidden = false;
}

function resetDemo() {
  state.story.runId += 1;
  state.story.playing = false;
  state.edit.runId += 1;
  state.edit.playing = false;
  state.try.runId += 1;
  state.try.status = "idle";
  state.try.remaining = 0;
  state.try.error = "";
  state.try.uploadName = "";
  if (state.recordingInterval) window.clearInterval(state.recordingInterval);
  state.recordingInterval = null;
  resetTakeVisuals();
  updateEditPass(0);
  renderTryIntoPage();
  document.getElementById("ug-silence-result").hidden = true;
  document.getElementById("ug-gate-error")?.setAttribute("hidden", "");
  document.getElementById("ug-judge-drawer").hidden = true;
  document.body.classList.remove("ug-drawer-open");
  document.querySelectorAll("[data-audio-kind]").forEach((button) => {
    button.classList.remove("ug-audio-playing");
    button.setAttribute("aria-pressed", "false");
    const icon = button.querySelector(".ug-audio-play");
    if (icon) icon.textContent = "▶";
  });
  document.querySelectorAll(".ug-entry-card").forEach((card) => card.classList.toggle("ug-entry-card-active", card.dataset.view === "story"));
  scrollToElement("#top");
  showToast("Back to snack-sized.");
}

function handleAction(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (action === "play-story") { event.preventDefault(); playStory(); }
  if (action === "play-edit") { event.preventDefault(); playEdit(); }
  if (action === "reset") { event.preventDefault(); resetDemo(); }
  if (action === "open-judge") { event.preventDefault(); openJudge(); }
  if (action === "close-judge") { event.preventDefault(); closeJudge(); }
  if (action === "silence") { event.preventDefault(); showSilenceResult(); }
  if (action === "test-gate") {
    const gate = window.UG_DATA.judge.gate;
    document.getElementById("ug-gate-status").textContent = String(gate.status);
    document.getElementById("ug-gate-message").textContent = gate.message;
    document.getElementById("ug-gate-error").hidden = false;
  }
  if (action === "record") {
    event.preventDefault();
    if (state.try.status === "recording") stopRecording();
    else startRecording();
  }
  if (action === "simulate-error") { event.preventDefault(); showTryError("The recording hook is not connected yet. No audio was sent."); }
  if (action === "readme") {
    event.preventDefault();
    const note = document.getElementById("ug-readme-note");
    note.hidden = false;
    note.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
  }
}

document.addEventListener("click", (event) => {
  handleAction(event);
  const card = event.target.closest("[data-view]");
  if (card) {
    document.querySelectorAll(".ug-entry-card").forEach((entry) => entry.classList.toggle("ug-entry-card-active", entry === card));
    if (card.dataset.view === "try") scrollToElement("#ug-scene-try");
    if (card.dataset.view === "story") scrollToElement("#ug-scene-take");
  }
  const transcriptWord = event.target.closest(".ug-transcript-word.ug-is-filler");
  if (transcriptWord) showToast(`Filler at ${formatTimestamp(transcriptWord.dataset.timestamp)}.`);
  const marker = event.target.closest(".ug-filler-marker");
  if (marker) showToast(`Filler at ${formatTimestamp(marker.dataset.timestamp)}.`);
  const audioButton = event.target.closest("[data-audio-kind]");
  if (audioButton) playAudio(audioButton.dataset.audioKind);
});

document.getElementById("ug-audio-upload")?.addEventListener("change", (event) => analyzeUpload(event.target.files?.[0]));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("ug-judge-drawer").hidden) closeJudge();
  const drawer = document.getElementById("ug-judge-drawer");
  if (event.key === "Tab" && drawer && !drawer.hidden) {
    const focusable = [...drawer.querySelectorAll("button:not([disabled]),a[href],input:not([disabled])")].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

applyData();
