const takeController = UGTake.createTakeController();
const animations = new Set();
let takeReady = null;
let cleanReady = null;
let manualAudioFrame = null;
let recorder = null;
let mediaStream = null;
let storyAttempt = null;
let cleanResult = null;
let sharedAudio = null;
let lastPracticeAttempt = null;
let storyAudioContext = null;
let storyAudioBuffers = { original: null, edit: null, burp: null };
let storySource = null;
let cancelStoryRange = null;

function beginTake({ keepAudioContext = false } = {}) {
  const token = takeController.begin();
  state.story.runId += 1;
  state.edit.runId += 1;
  state.story.playing = false; state.story.paused = false;
  state.edit.playing = false; activeStory = false;
  audioController.stop(keepAudioContext);
  if (state.recordingInterval) clearInterval(state.recordingInterval);
  state.recordingInterval = null;
  const oldRecorder = recorder; recorder = null;
  if (oldRecorder?.state === "recording") oldRecorder.stop();
  mediaStream?.getTracks().forEach((track) => track.stop()); mediaStream = null;
  animations.forEach((animation) => animation.cancel()); animations.clear();
  document.querySelectorAll(".ug-pill-flyer,.ug-fly-snack").forEach((node) => node.remove());
  document.querySelectorAll(".ug-scene-current,.ug-ab-active").forEach((node) => node.classList.remove("ug-scene-current", "ug-ab-active"));
  hideEatingSpotlight(); resetTakeVisuals();
  document.getElementById("ug-story-guide").hidden = true;
  document.querySelectorAll('[data-action="play-story"]').forEach((button) => { button.disabled = false; button.removeAttribute("aria-busy"); });
  storyAttempt = null; cleanResult = null; lastPracticeAttempt = null; takeReady = null; cleanReady = null;
  state.try.needsPlay = false;
  state.try.autoDismissed = false;
  document.getElementById("ug-story-end-actions").hidden = true;
  document.getElementById("ug-story-comparison").hidden = true;
  storyAudioBuffers = { original: null, edit: null, burp: null };
  state.gate = null;
  return token;
}

const audioController = {
  stop(keepContext = false) {
    stopStorySource();
    this.stopManual();
    if (sharedAudio) { sharedAudio.removeAttribute("src"); sharedAudio.load(); }
    if (!keepContext) { storyAudioContext?.close().catch(() => {}); storyAudioContext = null; }
    stopOtherMedia();
  },
  manual(media) {
    if (state.story.playing && !state.story.paused) setStoryPaused(true);
    stopOtherMedia(media);
  },
  story() { stopOtherMedia(); },
  stopManual() {
    sharedAudio?.pause();
    if (sharedAudio) sharedAudio.dataset.stopped = "true";
    if (sharedAudio) { try { sharedAudio.currentTime = 0; } catch {} }
    cancelAnimationFrame(manualAudioFrame); manualAudioFrame = null;
    ["ug-take-cursor", "ug-edit-original-cursor", "ug-edit-clean-cursor"].forEach((id) => setPlaybackCursor(id, 0, false));
    setAudioButtons();
  },
};

function friendlyError(error) {
  if (error?.name === "AbortError") return "That request was cancelled. Try again when you’re ready.";
  if (/429/.test(error?.message || "")) return "The goblin needs a short breather. Please try again in a minute.";
  return error?.message || "The goblin couldn’t hear that just now. Please try again.";
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || takeController.current.signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || "Request failed"}`);
  return body;
}

function mapAnalysis(result) {
  const words = (result.words || result.transcript || []).map((word) => ({
    t: word.text ?? word.word ?? "", s: Number(word.start) || 0, e: Number(word.end) || 0,
    f: Boolean(word.filler ?? ["um", "uh"].includes(String(word.word || word.text).toLowerCase().replace(/[^a-z]/g, "")))
  }));
  return {
    id: result.id, audioUrl: result.audioUrl, cleanAudioUrl: null, goblinAudioUrl: result.goblinAudioUrl,
    sample: { isSample: Boolean(result.sampleId), title: result.sampleId ? initialUGData.sample.title : "Your practice take", speaker: result.sampleId ? initialUGData.sample.speaker : state.try.uploadName || "Microphone recording", question: result.sampleId ? result.question || initialUGData.sample.question : "", durationSec: Number(result.durationSeconds) || words.at(-1)?.e || 0 },
    take: { fillers: result.fillers, spokenWords: result.spokenWords, per100: result.per100, covered: result.covered, verdict: result.verdict,
      words, coach: { habit: result.advice?.habit || "Take a quiet beat before your next thought.", drill: result.advice?.drill || "Pause once before answering your next sentence.", goblinLine: result.advice?.goblin_line || "I heard you. Keep practicing!" },
      timings: { deepgramMs: result.timings?.deepgramMs || 0, coachMs: result.timings?.coachMs || 0, coachLabel: result.timings?.coachLabel || result.coach } },
    edit: { passes: [{ pass: 0, fillers: result.fillers, words: words.length, duration: Number(result.durationSeconds) || words.at(-1)?.e || 0 }], label: "The goblin edit is ready when the checker finishes." }
  };
}

function showLoading(message) { showToast(message); }
function renderAllData() {
  const data = window.UG_DATA;
  document.getElementById("ug-take-content").innerHTML = renderTake(data);
  document.getElementById("ug-coach-content").innerHTML = renderCoach(data);
  document.getElementById("ug-edit-content").innerHTML = renderEdit(data);
  updateEditConclusion();
  ensurePlaybackCursors();
  document.getElementById("ug-judge-content").innerHTML = renderJudge(data);
  updateStoryDuration();
  updateTryHeading();
  if (typeof applyData === "function" && document.getElementById("ug-hero-copy").innerHTML === "") applyData();
}

function updateEditConclusion() {
  const conclusion = document.querySelector("#ug-edit-content .ug-edit-mood > span:not(.ug-goblin-art)");
  if (conclusion) conclusion.textContent = window.UG_DATA.edit.resultLine || "The goblin removes filler words while keeping your answer intact.";
}

function ensurePlaybackCursors() {
  const targets = [
    ["#ug-take-content #ug-take-wave .ug-wave", "ug-take-cursor"],
    ["#ug-edit-content .ug-edit-wave-card:first-child .ug-wave", "ug-edit-original-cursor"],
    ["#ug-edit-content #ug-edit-wave .ug-wave", "ug-edit-clean-cursor"],
  ];
  for (const [selector, id] of targets) {
    const wave = document.querySelector(selector);
    if (wave && !wave.querySelector(`#${id}`)) wave.insertAdjacentHTML("beforeend", `<span class="ug-playback-cursor" id="${id}" hidden></span>`);
  }
}

function setPlaybackCursor(id, ratio, visible = true) {
  const cursor = document.getElementById(id);
  if (!cursor) return;
  cursor.style.left = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  cursor.hidden = !visible;
}

function unlockStoryAudio(resume = true) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) { showToast("This browser can’t play story audio. Use the manual audio controls instead."); return; }
  if (!storyAudioContext || storyAudioContext.state === "closed") storyAudioContext = new AudioContextClass();
  if (resume && !state.story.paused) storyAudioContext.resume().catch(() => {});
}

function updateStoryDuration(measuredSeconds) {
  const data = window.UG_DATA;
  const seconds = measuredSeconds ?? UGTake.storySeconds(data.take.words, data.sample.durationSec, storyAudioBuffers.burp?.duration || 0, !data.sample.isSample);
  document.getElementById("ug-story-time").textContent = measuredSeconds == null ? `About ${seconds} sec` : `Last story: ${seconds} sec`;
}

function updateTryHeading() {
  const sample = window.UG_DATA.sample.isSample;
  document.getElementById("ug-try-title").textContent = sample ? "Now you try" : "Record another take";
  document.querySelector('.ug-scene-nav a[href="#ug-scene-try"] span:last-child').textContent = sample ? "Your turn" : "Your next take";
}

async function loadStoryAudio(token, signal = token.signal) {
  unlockStoryAudio(false);
  const context = storyAudioContext;
  const getBuffer = async (url) => {
    if (!url) return null;
    if (!context) return null;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not load audio (${response.status}).`);
    return await context.decodeAudioData(await response.arrayBuffer());
  };
  const data = window.UG_DATA;
  const results = await Promise.allSettled([getBuffer(data.audioUrl), getBuffer(data.cleanAudioUrl), getBuffer(data.goblinAudioUrl)]);
  if (!takeController.isCurrent(token) || signal.aborted) return;
  storyAudioBuffers = Object.fromEntries(["original", "edit", "burp"].map((key, i) => [key, results[i].status === "fulfilled" ? results[i].value : null]));
  updateStoryDuration();
}

function stopStorySource() {
  const source = storySource;
  cancelStoryRange?.();
  try { source?.stop(); } catch {}
  storySource = null;
  setStoryMouth(false);
}

function setStoryMouth(playing) {
  document.querySelectorAll("#ug-hero-goblin,.ug-goblin-snack,.ug-goblin-hungry,.ug-spotlight-goblin-art").forEach((goblin) => goblin.classList.toggle("ug-audio-mouth-moving", playing));
}

async function playStoryRange(buffer, start, end, cursorId, runId) {
  while (state.story.runId === runId && state.story.paused && !state.story.skipRequested && !state.story.nextRequested) await wait(80);
  if (state.story.runId !== runId || state.story.skipRequested || state.story.nextRequested || !storyAudioContext || !buffer || end <= start) return;
  const token = takeController.current;
  const context = storyAudioContext;
  stopStorySource();
  audioController.story();
  const from = Math.max(0, Math.min(start, buffer.duration));
  const until = Math.max(from, Math.min(end, buffer.duration));
  if (until <= from) return Promise.resolve();
  const source = storyAudioContext.createBufferSource();
  source.buffer = buffer; source.connect(storyAudioContext.destination); storySource = source;
  setStoryMouth(true);
  const scheduledAt = storyAudioContext.currentTime;
  let animationFrame;
  const draw = () => {
    if (!takeController.isCurrent(token) || state.story.runId !== runId || storySource !== source) return;
    const played = Math.max(0, context.currentTime - scheduledAt);
    setPlaybackCursor(cursorId, (from + Math.min(played, until - from)) / buffer.duration, true);
    animationFrame = requestAnimationFrame(draw);
  };
  animationFrame = requestAnimationFrame(draw);
  await new Promise((resolve) => {
    let settled = false;
    let runningMs = 0;
    let activeWallMs = 0;
    let lastTick = Date.now();
    const complete = () => {
      if (settled) return;
      settled = true;
      source.onended = null;
      if (cancelStoryRange === complete) cancelStoryRange = null;
      clearInterval(safetyTimer);
      cancelAnimationFrame(animationFrame);
      if (storySource === source) storySource = null;
      if (!storySource) setStoryMouth(false);
      if (takeController.isCurrent(token)) setPlaybackCursor(cursorId, until / buffer.duration, false);
      resolve();
    };
    const safetyTimer = setInterval(() => {
      const now = Date.now();
      if (!takeController.isCurrent(token) || state.story.runId !== runId || context.state === "closed") { complete(); return; }
      if (context.state === "running") runningMs += now - lastTick;
      if (!state.story.paused) activeWallMs += now - lastTick;
      lastTick = now;
      if (runningMs > (until - from) * 1000 + 2500 || activeWallMs > (until - from) * 1000 + 15000) { try { source.stop(); } catch {} complete(); }
    }, 250);
    source.onended = complete;
    cancelStoryRange = complete;
    source.start(0, from, until - from);
  });
  while (state.story.runId === runId && state.story.paused && !state.story.skipRequested && !state.story.nextRequested) await wait(80);
}

async function waitStory(milliseconds, runId) {
  let remaining = milliseconds;
  while (remaining > 0 && state.story.runId === runId && !state.story.skipRequested && !state.story.nextRequested) {
    if (state.story.paused) { await wait(80); continue; }
    const interval = Math.min(80, remaining);
    const startedAt = Date.now();
    await wait(interval);
    if (!state.story.paused) remaining -= Date.now() - startedAt;
  }
  if (state.story.runId !== runId || state.story.skipRequested) return "stopped";
  if (state.story.nextRequested) { state.story.nextRequested = false; return "next"; }
  return "elapsed";
}

function setStoryStage(scene, caption) {
  const guide = document.getElementById("ug-story-guide");
  guide.hidden = false;
  document.getElementById("ug-story-progress").textContent = `Scene ${scene}/4`;
  document.getElementById("ug-story-progress").setAttribute("aria-label", `Scene ${scene} of 4`);
  const progress = document.querySelector(".ug-story-progress-track");
  progress?.setAttribute("aria-valuenow", String(scene));
  const fill = document.getElementById("ug-story-progress-fill");
  if (fill) fill.style.width = `${scene * 25}%`;
  document.getElementById("ug-story-caption").textContent = caption;
  document.getElementById("ug-story-comparison").hidden = true;
  document.getElementById("ug-story-next").hidden = !state.story.playing;
  document.querySelectorAll(".ug-scene-card").forEach((card) => card.classList.remove("ug-scene-current"));
  document.getElementById(["", "ug-scene-take", "ug-scene-coach", "ug-scene-edit", "ug-scene-try"][scene])?.classList.add("ug-scene-current");
}

function stopOtherMedia(except) {
  if (sharedAudio && sharedAudio !== except && !sharedAudio.paused) sharedAudio.pause();
  document.querySelectorAll("audio, video").forEach((media) => { if (media !== except && !media.paused) media.pause(); });
}

function setStoryPaused(paused) {
  if (!state.story.playing) return;
  if (paused && !state.story.paused) state.story.pauseStartedAt = performance.now();
  if (!paused && state.story.paused) state.story.pausedMs += performance.now() - state.story.pauseStartedAt;
  state.story.paused = paused;
  if (!paused) stopOtherMedia();
  document.querySelectorAll('[data-action="pause-story"]').forEach((button) => { button.textContent = paused ? "Resume" : "Pause"; });
  animations.forEach((animation) => paused ? animation.pause() : animation.play());
  if (!storyAudioContext || storyAudioContext.state === "closed") return;
  (paused ? storyAudioContext.suspend() : storyAudioContext.resume()).catch(() => {});
}

function skipStory() {
  if (!state.story.playing) return;
  state.try.autoDismissed = true;
  state.story.skipRequested = true;
  state.story.paused = false;
  stopStorySource();
  storyAudioContext?.resume().catch(() => {});
  state.story.preparation?.abort();
  animations.forEach((animation) => animation.cancel());
  finishStory(state.story.runId);
  activeStory = false;
  document.querySelectorAll('[data-action="play-story"]').forEach((button) => { button.disabled = false; button.removeAttribute("aria-busy"); });
}

function nextStory() {
  if (!state.story.playing) return;
  state.story.nextRequested = true;
  if (state.story.paused) setStoryPaused(false);
  stopStorySource();
  animations.forEach((animation) => animation.cancel());
  storyAudioContext?.resume().catch(() => {});
}

function showEatingSpotlight() {
  const spotlight = document.getElementById("ug-eating-spotlight");
  const transcript = document.querySelector("#ug-scene-take .ug-transcript")?.cloneNode(true);
  const mount = document.getElementById("ug-spotlight-transcript");
  if (transcript && mount) {
    transcript.querySelectorAll("button").forEach((button) => { button.disabled = true; button.tabIndex = -1; });
    mount.replaceChildren(transcript);
  }
  document.getElementById("ug-spotlight-goblin").innerHTML = goblinMarkup("ug-spotlight-mouth", "ug-goblin-hungry ug-spotlight-goblin-art");
  spotlight.hidden = false;
  spotlight.setAttribute("aria-hidden", "false");
  document.body.classList.add("ug-eating-spotlight");
}

function hideEatingSpotlight() {
  const spotlight = document.getElementById("ug-eating-spotlight");
  spotlight.hidden = true;
  spotlight.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ug-eating-spotlight");
  document.getElementById("ug-spotlight-caption").textContent = "";
}

function animateSpotlightPill(pill, slow = true) {
  // Claude: slower, clearly visible flight. A copy of the pill lifts off, glows, arcs up and is swallowed;
  // the original stays in the transcript as a faded, struck-through ghost so viewers see what was removed.
  if (!pill) return Promise.resolve();
  if (reducedMotion.matches || typeof document.body.animate !== "function") {
    pill.classList.add("ug-spotlight-pill-eaten");
    return Promise.resolve();
  }
  const mouth = document.getElementById("ug-spotlight-mouth");
  const from = pill.getBoundingClientRect();
  const to = mouth.getBoundingClientRect();
  const flyer = pill.cloneNode(true);
  flyer.classList.add("ug-pill-flyer");
  Object.assign(flyer.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: "0", zIndex: "1000", pointerEvents: "none" });
  document.body.appendChild(flyer);
  pill.classList.add("ug-spotlight-pill-target");
  const dx = to.left + to.width / 2 - from.left - from.width / 2;
  const dy = to.top + to.height / 2 - from.top - from.height / 2;
  const duration = slow ? 1000 : 650;
  const animation = flyer.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
    { transform: "translate(0,-14px) scale(1.6)", opacity: 1, offset: 0.25 },
    { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 80}px) scale(1.4) rotate(-8deg)`, opacity: 1, offset: 0.65 },
    { transform: `translate(${dx}px,${dy}px) scale(0.15) rotate(10deg)`, opacity: 0.2, offset: 1 },
  ], { duration, easing: "cubic-bezier(.3,.7,.2,1)" });
  const token = takeController.current;
  animations.add(animation);
  const done = () => { animations.delete(animation); flyer.remove(); if (!takeController.isCurrent(token)) return; pill.classList.remove("ug-spotlight-pill-target"); pill.classList.add("ug-spotlight-pill-eaten"); };
  return animation.finished.then(done).catch(done);
}

function keepPillVisible(pill) {
  const mount = document.getElementById("ug-spotlight-transcript");
  if (!pill || !mount) return;
  const bounds = mount.getBoundingClientRect(), target = pill.getBoundingClientRect();
  if (target.top < bounds.top + 12 || target.bottom > bounds.bottom - 12) mount.scrollTop += target.top - bounds.top - mount.clientHeight / 2 + target.height / 2;
}

function updateManualProgress() {
  if (!sharedAudio) return;
  const ratio = Number.isFinite(sharedAudio.duration) && sharedAudio.duration > 0 ? sharedAudio.currentTime / sharedAudio.duration : 0;
  const original = sharedAudio.dataset.kind === "original";
  const visible = !sharedAudio.ended && sharedAudio.dataset.stopped !== "true";
  setPlaybackCursor("ug-take-cursor", ratio, original && visible);
  setPlaybackCursor("ug-edit-original-cursor", ratio, original && visible);
  setPlaybackCursor("ug-edit-clean-cursor", ratio, !original && visible);
  const label = document.getElementById("ug-audio-now");
  if (label) label.textContent = `${original ? "Original" : "Goblin edit"} · ${window.UG_DATA.sample.speaker} · ${formatSeconds(sharedAudio.currentTime)} / ${formatSeconds(sharedAudio.duration)}`;
}

function animateManualPlayback() {
  cancelAnimationFrame(manualAudioFrame);
  const token = takeController.current;
  const draw = () => {
    if (!takeController.isCurrent(token) || !sharedAudio || sharedAudio.paused) return;
    updateManualProgress();
    manualAudioFrame = requestAnimationFrame(draw);
  };
  draw();
}

function setAudioButtons() {
  document.querySelectorAll("[data-audio-kind]").forEach((button) => {
    const active = sharedAudio && !sharedAudio.paused && button.dataset.audioKind === sharedAudio.dataset.kind;
    button.classList.toggle("ug-audio-playing", Boolean(active));
    button.setAttribute("aria-pressed", String(Boolean(active)));
    const icon = button.querySelector(".ug-audio-play"); if (icon) icon.textContent = active ? "Ⅱ" : "▶";
  });
  document.querySelectorAll("#ug-hero-goblin,.ug-goblin-snack,.ug-goblin-hungry").forEach((g) => g.classList.toggle("ug-audio-mouth-moving", Boolean(sharedAudio && !sharedAudio.paused)));
  const stop = document.querySelector('[data-action="stop-audio"]');
  if (stop) stop.hidden = !sharedAudio?.getAttribute("src");
}

async function playAudio(kind) {
  const token = takeController.current;
  if (["acquiring", "recording"].includes(state.try.status)) { showToast("Finish your recording before listening back."); return; }
  if (state.try.status === "analyzing") state.try.autoDismissed = true;
  if (state.story.playing && !state.story.paused) setStoryPaused(true);
  await takeReady;
  if (kind === "edit") await cleanReady;
  if (!takeController.isCurrent(token)) return;
  if (state.try.status === "error" && !storyAttempt) { showToast("Choose a new take to listen back."); return; }
  const url = kind === "original" ? window.UG_DATA.audioUrl : window.UG_DATA.cleanAudioUrl;
  if (!url) { showToast(kind === "edit" ? "The edit audio isn’t available for this take." : "Original audio isn’t available."); return; }
  if (!sharedAudio) {
    sharedAudio = new Audio();
    ["play", "pause", "ended", "error"].forEach((event) => sharedAudio.addEventListener(event, setAudioButtons));
    sharedAudio.addEventListener("play", animateManualPlayback);
    sharedAudio.addEventListener("timeupdate", updateManualProgress);
  }
  if (sharedAudio.dataset.kind === kind && !sharedAudio.paused) { sharedAudio.pause(); return; }
  // Claude: only one sound at a time — a manual play pauses the story narration.
  audioController.manual(sharedAudio);
  sharedAudio.pause(); sharedAudio.src = url; sharedAudio.dataset.kind = kind;
  sharedAudio.dataset.stopped = "false";
  try { await sharedAudio.play(); } catch { if (takeController.isCurrent(token)) showToast("Audio couldn’t play in this browser. Try the button again."); }
  if (!takeController.isCurrent(token)) return;
  setAudioButtons();
}

async function analyzeUpload(file) {
  if (!file) return;
  const token = beginTake({ keepAudioContext: true });
  unlockStoryAudio();
  const mime = UGTake.audioMime(file.name, file.type);
  if (!mime.startsWith("audio/")) return showTryError("That file does not look like audio. Choose an audio file to continue.");
  if (file.size > 8 * 1024 * 1024) return showTryError("Audio must be 8 MB or smaller.");
  state.try.uploadName = file.name; state.try.status = "analyzing"; state.try.error = ""; renderTryIntoPage();
  takeReady = submitTake(file, mime, token);
  await takeReady;
}

async function submitTake(body, mime, token) {
  try {
    const result = await api(`/api/analyze?question=${encodeURIComponent("Free speaking practice; no set topic to check.")}`, { method: "POST", headers: { "Content-Type": mime }, body, signal: token.signal });
    if (!takeController.isCurrent(token)) return;
    cleanReady = prepareTake(result, token);
    renderPracticeResult(result);
    // Do not wait for the edit checker before responding to the user's voice.
    if (!state.try.autoDismissed) playStory({ automatic: true, eatFirst: true });
    else { state.try.needsPlay = true; renderTryIntoPage(); }
  } catch (error) { if (takeController.isCurrent(token) && error.name !== "AbortError") showTryError(friendlyError(error)); }
}

async function startRecording() {
  if (state.try.status === "acquiring" || state.try.status === "recording") return;
  const token = beginTake({ keepAudioContext: true });
  unlockStoryAudio();
  state.try.uploadName = "Microphone recording";
  state.try.status = "acquiring"; state.try.error = ""; renderTryIntoPage();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!takeController.isCurrent(token)) { stream.getTracks().forEach((track) => track.stop()); return; }
    const chunks = [];
    const localRecorder = new MediaRecorder(stream);
    mediaStream = stream; recorder = localRecorder;
    localRecorder.addEventListener("dataavailable", (event) => { if (takeController.isCurrent(token) && event.data.size) chunks.push(event.data); });
    localRecorder.addEventListener("stop", async () => {
      stream.getTracks().forEach((track) => track.stop());
      if (!takeController.isCurrent(token)) return;
      mediaStream = null; recorder = null;
      const blob = new Blob(chunks, { type: localRecorder.mimeType || "audio/webm" });
      state.try.status = "analyzing"; renderTryIntoPage();
      takeReady = submitTake(blob, blob.type, token);
      await takeReady;
    }, { once: true });
    localRecorder.start(); state.try.runId += 1; state.try.uploadName = ""; state.try.remaining = 90; state.try.status = "recording"; state.try.error = ""; renderTryIntoPage();
    state.recordingInterval = window.setInterval(() => { if (!takeController.isCurrent(token)) return; state.try.remaining = Math.max(0, state.try.remaining - 1); updateRecordingTimer(); if (!state.try.remaining) stopRecording(); }, 1000);
  } catch (error) { stream?.getTracks().forEach((track) => track.stop()); if (takeController.isCurrent(token)) { mediaStream = null; recorder = null; showTryError(error.name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser, or upload an audio file instead." : `Microphone unavailable: ${friendlyError(error)}`); } }
}

function stopRecording() {
  unlockStoryAudio();
  if (state.recordingInterval) window.clearInterval(state.recordingInterval); state.recordingInterval = null;
  if (recorder?.state === "recording") recorder.stop();
  else if (mediaStream) { mediaStream.getTracks().forEach((track) => track.stop()); mediaStream = null; }
}

async function renderPracticeResult(result) {
  lastPracticeAttempt = result;
  state.try.status = "result"; state.try.error = ""; renderTryIntoPage();
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
    isSample: true,
    title: "A real recorded answer",
    speaker: "Astronaut press conference (NASA, public domain)",
    question: "What does an all-female spacewalk mean to you?",
    durationSec: 25.9
  },
  source: "offline",
  audioUrl: "/samples/spacewalk.wav",
  cleanAudioUrl: null,
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
      { pass: 0, fillers: 9, words: 71, duration: 25.9 },
      { pass: 1, fillers: 2, words: 64, duration: 23.2 },
      { pass: 2, fillers: 0, words: 62, duration: 22.8 }
    ],
    label: "Offline preview — not live data. Edited by the goblin; it shows the target, you still have to say it."
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
    sprite: { serverUptimeSeconds: null, previousVisit: "—", attemptsInLair: "—", keysOnSprite: 0 }
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

const initialUGData = structuredClone(window.UG_DATA);
let sampleSnapshot = null;

const state = {
  story: { eaten: 0, playing: false, paused: false, skipRequested: false, nextRequested: false, runId: 0 },
  edit: { passIndex: 0, playing: false, runId: 0 },
  try: { status: "idle", remaining: 0, error: "", uploadName: "", runId: 0 },
  recordingInterval: null,
  gate: null,
  toastTimer: null,
  lastFocus: null
};

let activeStory = false;

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
  return `<p class="ug-eyebrow"><span class="ug-eyebrow-dot"></span>${escapeHTML(data.ui.heroEyebrow)}</p><h1 id="ug-hero-title">${escapeHTML(data.ui.heroTitleBefore)} <span class="ug-headline-mark">${escapeHTML(data.ui.heroHighlight)}</span> ${escapeHTML(data.ui.heroTitleAfter)}</h1><p class="ug-hero-subtitle">${escapeHTML(data.ui.heroSubtitle)}</p><p class="ug-hero-explanation">Record or upload an answer. The goblin finds every “um”, eats it, and hands back an edit — re-checked, and any changed word is shown to you.</p><div class="ug-hero-actions"><button class="ug-button ug-button-primary" type="button" data-action="play-story"><span class="ug-play-icon" aria-hidden="true">▶</span> ${escapeHTML(data.ui.playStoryLabel)}</button><span class="ug-hero-caption">${escapeHTML(data.ui.heroCaption)}</span></div>`;
}

function renderEntryCards(data) {
  return `<div class="ug-entry-card ug-entry-card-active"><span class="ug-entry-title">The sample · a real human voice</span><span class="ug-entry-meta">A real answer takes center stage.</span></div><a class="ug-entry-card" href="#ug-scene-try" data-view="try"><span class="ug-entry-title"><span>Try it yourself · your voice</span><span aria-hidden="true">↗</span></span><span class="ug-entry-meta">Record or upload. Watch the goblin react.</span></a><a class="ug-entry-card ug-entry-card-judge" href="#ug-judge-drawer" data-view="judge" data-action="open-judge"><span class="ug-entry-title"><span>I’m a judge · proof &amp; plumbing</span><span aria-hidden="true">↗</span></span><span class="ug-entry-meta">What it measures, remembers, and misses.</span></a>`;
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
  return `${data.source === "offline" ? `<p class="ug-offline-label" role="status">Offline preview — not live data</p>` : ""}<div class="ug-sample-head"><div><h4 class="ug-sample-title">${escapeHTML(sample.title)}</h4><p class="ug-sample-speaker">${escapeHTML(sample.speaker)}</p></div><span class="ug-sample-duration">${formatDurationLabel(sample.durationSec)}</span></div><div class="ug-question-box">${sample.isSample ? `“${escapeHTML(sample.question)}”` : "Your own topic · topic not checked"}</div><div class="ug-wave-card"><div class="ug-wave-header"><span class="ug-wave-label">Original answer · ${escapeHTML(take.spokenWords)} words</span><span class="ug-wave-legend"><i class="ug-wave-legend-dot"></i> filler words</span></div><div id="ug-take-wave">${renderWave(words, sample.durationSec, { markers: true, label: "Original answer" })}</div><div class="ug-wave-scale"><span>00:00</span><span>${formatDurationLabel(sample.durationSec)}</span></div></div><div class="ug-take-bottom"><div><p class="ug-transcript-label"><span>Transcript</span><span class="ug-transcript-help">Tap a highlighted word for its timestamp</span></p><p class="ug-transcript">${transcript}</p></div><div class="ug-take-stats"><div class="ug-stat-box"><span class="ug-stat-value" id="ug-eaten-counter" aria-live="polite">0</span><span class="ug-stat-label">fillers eaten</span></div><div class="ug-stat-box"><span class="ug-stat-value" id="ug-per100-counter" aria-live="polite">0.0</span><span class="ug-stat-label">fillers per 100 words</span></div></div></div><div class="ug-goblin-quip">${goblinMarkup("ug-snack-mouth", "ug-goblin-snack") }<div class="ug-quip-bubble" id="ug-take-bubble" hidden aria-live="polite">${escapeHTML(take.coach.goblinLine)}</div></div>`;
}

function renderCoach(data) {
  const coach = data.take.coach;
  const covered = data.take.covered
    ? `<span class="ug-chip-good" aria-label="yes">✓</span><strong>Yes</strong>`
    : `<span class="ug-chip-good" aria-label="no" style="color:var(--ug-blocked)">×</span><strong>No</strong>`;
  return `<div class="ug-coach-layout"><div class="ug-coach-note"><span class="ug-note-label">Habit</span><h4>One tiny pattern</h4><p>${escapeHTML(coach.habit)}</p></div><div class="ug-coach-note"><span class="ug-note-label">Next drill</span><h4>Try this on your next answer</h4><p>${escapeHTML(coach.drill)}</p></div></div><div class="ug-stat-chips"><span class="ug-stat-chip">Fillers <strong>${escapeHTML(data.take.fillers)}</strong></span><span class="ug-stat-chip">Per 100 words <strong>${escapeHTML(data.take.per100)}</strong></span><span class="ug-stat-chip">${data.sample.isSample ? `Answer covered ${covered}` : "Topic not checked"}</span></div>`;
}

function changedWordsWarning() {
  const changes = cleanResult?.changedWords || [];
  if (!changes.length) return "";
  const words = changes.map((change) => `‘${change.before ?? change.after ?? "—"}’`).join(", ");
  return `<p class="ug-edit-warning" role="status">${changes.length} ${changes.length === 1 ? "word" : "words"} changed: ${escapeHTML(words)} — listen before you use this edit.</p>`;
}

function renderEdit(data) {
  const passes = data.edit.passes || [];
  const first = passes.at(-1) || { fillers: 0, duration: data.sample.durationSec };
  const allFillerIndexes = data.take.words.map((word, index) => word.f ? index : -1).filter((index) => index >= 0);
  const initialKeep = new Set(allFillerIndexes.slice(0, numberValue(first.fillers)));
  return `<div class="ug-edit-intro"><p>The checker compares your original answer with the goblin edit and reports any changed words.</p><button class="ug-button ug-button-primary ug-edit-play" type="button" data-action="play-edit"><span class="ug-play-icon" aria-hidden="true">▶</span> Play the edit</button></div><div class="ug-edit-wave-grid"><div class="ug-edit-wave-card"><div class="ug-edit-wave-head"><strong>Original</strong><span class="ug-edit-duration">${formatDurationLabel(data.sample.durationSec)}</span></div>${renderWave(data.take.words, data.sample.durationSec, { markers: false, label: "Original" })}</div><div class="ug-edit-wave-card"><div class="ug-edit-wave-head"><strong>Goblin edit</strong><span class="ug-edit-duration" id="ug-edit-duration">${formatDurationLabel(first.duration)}</span></div><div id="ug-edit-wave">${renderWave(data.take.words, first.duration, { markers: false, edit: true, omitFillers: true, keepFillers: initialKeep, label: "Goblin edit" })}</div></div></div><div class="ug-audio-row"><button class="ug-audio-button" type="button" data-audio-kind="original" aria-pressed="false"><span class="ug-audio-play" aria-hidden="true">▶</span><span class="ug-audio-copy"><strong>Hear the original</strong><small>${data.audioUrl ? "Play the recorded answer" : "Audio unavailable"}</small></span></button><div class="ug-edit-listen"><button class="ug-audio-button" type="button" data-audio-kind="edit" aria-pressed="false"><span class="ug-audio-play" aria-hidden="true">▶</span><span class="ug-audio-copy"><strong>Hear the goblin edit</strong><small>${data.cleanAudioUrl ? "Play the edited answer" : "Edit audio unavailable"}</small></span></button>${changedWordsWarning()}</div></div><div class="ug-manual-playback"><span id="ug-audio-now">${escapeHTML(data.sample.speaker)}</span><button class="ug-story-control" type="button" data-action="stop-audio" hidden>■ Stop</button></div><p class="ug-edit-honesty">${cleanResult ? cleanResult.mock ? "Preview: the edit statistics are simulated." : "The edit was checked. Listen and review any changed words." : "The edit has not been verified yet."}</p><div class="ug-edit-mood">${goblinMarkup("ug-edit-mouth", "ug-goblin-hungry")}<span>The checker will report exactly how many words it kept.</span></div>`;
}

function renderTry(data, tryState = { status: "idle", remaining: numberValue(data.demo.recordLimitSec) }) {
  const limit = numberValue(data.demo.recordLimitSec);
  const remaining = tryState.status === "recording" ? Math.max(0, numberValue(tryState.remaining)) : limit;
  const progress = limit ? (remaining / limit) * 100 : 100;
  const recording = tryState.status === "recording";
  const isAnalyzing = ["analyzing", "acquiring"].includes(tryState.status);
  const buttonText = recording ? "Stop recording" : "Record";
  let stateContent = "";
  if (recording) stateContent = `<div class="ug-try-state"><span class="ug-try-state-icon">●</span><div class="ug-try-state-copy"><strong>Recording your answer</strong><p>Your microphone is live. Stop when you’ve finished speaking.</p></div></div>`;
  if (isAnalyzing) stateContent = `<div class="ug-try-state ug-state-analyzing" role="status"><span class="ug-try-state-icon">…</span><div class="ug-try-state-copy"><strong>The goblin is listening</strong><p>${tryState.uploadName ? `Checking ${escapeHTML(tryState.uploadName)}. ` : "Checking your answer."}This can take a few seconds.</p></div></div>`;
  if (tryState.status === "result") stateContent = `<div class="ug-try-state" role="status"><span class="ug-try-state-icon">✓</span><div class="ug-try-state-copy"><strong>Take analyzed</strong><p>${escapeHTML(data.sample.speaker)} · ${formatDurationLabel(data.sample.durationSec)} · ${escapeHTML(data.take.fillers)} fillers</p><p>Topic not checked. ${data.take.fillers ? "The goblin is ready for your ums." : "No ums to eat — the goblin stays hungry."}</p>${tryState.needsPlay ? `<button class="ug-button ug-button-primary ug-result-play" type="button" data-action="play-my-take">▶ Play my result</button>` : ""}</div></div>`;
  if (tryState.status === "error") stateContent = `<div class="ug-try-state ug-state-error" role="alert"><span class="ug-try-state-icon">!</span><div class="ug-try-state-copy"><strong>Couldn’t finish that take</strong><p>${escapeHTML(tryState.error || "The demo hook returned an error.")}</p></div></div>`;
  return `<div class="ug-try-layout"><div><p class="ug-try-question">Speak about any topic.</p><p class="ug-try-instruction">Take a breath, then speak in your own words. You have ${escapeHTML(limit)} seconds.</p><div class="ug-try-actions"><button class="ug-record-button${recording ? " ug-recording" : ""}" type="button" data-action="record" aria-label="${escapeHTML(buttonText)}" style="--ug-ring-progress:${progress.toFixed(1)}%" ${isAnalyzing ? "disabled" : ""}><span class="ug-record-core"><strong>${escapeHTML(buttonText)}</strong><span id="ug-record-time">${formatSeconds(remaining)}</span></span></button><div class="ug-try-utility"><label class="ug-dropzone" for="ug-audio-upload" id="ug-dropzone"><span class="ug-dropzone-icon" aria-hidden="true">⇪</span><span class="ug-dropzone-copy"><strong class="ug-upload-label">Upload a file &amp; watch the goblin</strong><small>Click to choose, or drop an audio file here · wav, mp3, m4a · up to 8 MB / 90 s</small></span></label><input class="ug-upload-input" id="ug-audio-upload" type="file" accept="audio/*" aria-label="Choose an audio file"/></div></div><p class="ug-try-disclaimer"><span class="ug-privacy-icon" aria-hidden="true">◈</span>Your audio is used to analyze this take.</p></div><div><div id="ug-try-state-area">${stateContent}</div><div class="ug-try-state" id="ug-try-idle-note" ${tryState.status === "idle" ? "" : "hidden"}><span class="ug-try-state-icon">i</span><div class="ug-try-state-copy"><strong>Ready when you are</strong><p>Record a short answer or upload an audio file to get started.</p></div></div></div></div>`;
}

function renderJudge(data) {
  const sprite = data.judge.sprite;
  const measured = data.judge.measured || [];
  const rows = measured.map(([label, value, badge]) => `<tr><td>${escapeHTML(label)}</td><td>${escapeHTML(value)}</td><td><span class="ug-real-pill${badge === "REAL finding" ? " ug-real-finding" : ""}">${escapeHTML(badge)}</span></td></tr>`).join("");
  const passes = (data.edit.passes || []).map((pass, index) => `<div class="ug-pass-step${index === (data.edit.passes.length - 1) ? " ug-pass-active" : ""}"><strong>Pass ${escapeHTML(pass.pass)} · <span class="ug-pass-filler-count">${escapeHTML(pass.fillers)} ums</span></strong><span>${escapeHTML(pass.words)} words · ${formatDurationLabel(pass.duration)}</span></div>`).join("");
  return `<section class="ug-judge-card"><h3>No connector, no goblin</h3><p>The coach gate blocks cleanly when there is no Deepgram connection available.</p><button class="ug-button ug-button-blocked" type="button" data-action="test-gate">Test the gate <span aria-hidden="true">↗</span></button><div class="ug-gate-error" id="ug-gate-error" ${state.gate ? "" : "hidden"} role="status"><strong class="ug-gate-status" id="ug-gate-status">${escapeHTML(state.gate?.status)}</strong><span id="ug-gate-message">${escapeHTML(state.gate?.message)}</span></div></section><section class="ug-judge-card"><h3>The lair remembers</h3><p>A small, inspectable Sprite footprint for this request.</p><div class="ug-sprite-facts"><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.serverUptimeSeconds ?? "—")}s</strong><span>server uptime</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.previousVisit)}</strong><span>previous visit</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.attemptsInLair)}</strong><span>attempts in this lair</span></div><div class="ug-sprite-fact"><strong>${escapeHTML(sprite.keysOnSprite)}</strong><span>API keys on the Sprite</span></div></div></section><section class="ug-judge-card"><h3>How the checker works</h3><p>Coach: ${escapeHTML(data.take.timings.coachLabel || "unavailable")} · ${(numberValue(data.take.timings.coachMs) / 1000).toFixed(1)} s. ${escapeHTML(data.edit.label)}</p><p>Recordings stay on your own Sprite.</p><p>Pass 0 is the original. Each later pass is the edited audio sent back to Deepgram, which listens again for filler words. It stops when none remain or after three re-checks.</p><div class="ug-pass-row ug-judge-pass-row">${passes}</div></section><section class="ug-judge-card"><h3>What it catches (and what it misses)</h3><p>Evidence from the demo’s real clip checks and cutter tests.</p><div class="ug-measured-wrap"><table class="ug-measured-table"><thead><tr><th>Finding</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div><a class="ug-readme-link" href="#ug-readme-note" data-action="readme">Read the README</a><div class="ug-readme-note" id="ug-readme-note" hidden><p>Recordings are analyzed by Deepgram and edited audio is re-checked by Deepgram. The judge panel reports the supplied measured evidence and the connector-gate response.</p></div></section>`;
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
  updateEditConclusion();
  ensurePlaybackCursors();
  document.getElementById("ug-try-content").innerHTML = renderTry(data, state.try);
  document.getElementById("ug-judge-content").innerHTML = renderJudge(data);
  document.querySelectorAll("[data-scene-number]").forEach((element) => {
    const index = numberValue(element.dataset.sceneNumber);
    element.textContent = String(index + 1).padStart(2, "0");
  });
  updateStoryDuration(); updateTryHeading();
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
  animations.add(animation);
  animation.finished.catch(() => {}).finally(() => { animations.delete(animation); snack.remove(); });
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
  if (!pass) return {};
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
  ensurePlaybackCursors();
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
  try {
    if (reducedMotion.matches) {
      updateEditPass(passes.length - 1);
      return;
    }
    for (let index = 0; index < passes.length; index += 1) {
      if (state.edit.runId !== runId) return;
      updateEditPass(index);
      await wait(numberValue(window.UG_DATA.demo.passDurationMs));
    }
  } finally { if (state.edit.runId === runId) state.edit.playing = false; }
}

async function prepareTake(attempt, token) {
  if (!takeController.isCurrent(token)) return;
  storyAttempt = attempt;
  window.UG_DATA = { ...window.UG_DATA, ...mapAnalysis(attempt), source: "live" };
  if (!attempt.fillers) window.UG_DATA.cleanAudioUrl = attempt.audioUrl;
  renderAllData();
  try {
    const clean = await api(`/api/attempts/${encodeURIComponent(attempt.id)}/clean`, { method: "POST", signal: token.signal });
    if (!takeController.isCurrent(token)) return;
    cleanResult = clean;
    window.UG_DATA.cleanAudioUrl = clean.cleanAudioUrl || (!attempt.fillers ? attempt.audioUrl : null);
    window.UG_DATA.edit = { passes: clean.passes || [], label: clean.label, resultLine: cleanConclusion(attempt, clean) };
    window.UG_DATA.judge.measured = [
      [`Current ${attempt.sampleId ? "sample" : "practice take"}: filler re-check`, clean.passes.map((pass) => pass.fillers).join(" → "), clean.mock ? "MOCK" : "LIVE"],
      ...initialUGData.judge.measured.map(([label, value, badge]) => [`Sample benchmark: ${label}`, value, badge]),
    ];
    renderEditResult();
  } catch (error) {
    if (!takeController.isCurrent(token)) return;
    window.UG_DATA.edit.label = "Edit not verified — the checker could not finish.";
    window.UG_DATA.edit.resultLine = "Content words and remaining fillers have not been verified.";
    renderEditResult();
    showToast(`Take analyzed, but the edit could not finish: ${friendlyError(error)}`);
  }
}

function renderEditResult() {
  document.getElementById("ug-edit-content").innerHTML = renderEdit(window.UG_DATA);
  document.getElementById("ug-judge-content").innerHTML = renderJudge(window.UG_DATA);
  updateEditConclusion(); ensurePlaybackCursors(); setAudioButtons();
}

async function bootstrapSample(token) {
  try {
    const attempt = await api("/api/analyze?sample=spacewalk", { method: "POST", signal: token.signal });
    if (!takeController.isCurrent(token)) return;
    await prepareTake(attempt, token);
    if (takeController.isCurrent(token)) sampleSnapshot = { data: structuredClone(window.UG_DATA), attempt, clean: cleanResult };
  } catch (error) { if (takeController.isCurrent(token) && error.name !== "AbortError") showToast(`${friendlyError(error)} Showing the offline preview.`); }
}

async function playStory({ automatic = false, eatFirst = !window.UG_DATA.sample.isSample } = {}) {
  if (state.story.playing || activeStory) return;
  if (["acquiring", "recording"].includes(state.try.status)) return;
  if (!automatic) unlockStoryAudio();
  const token = takeController.current;
  state.story.userTake = Boolean(lastPracticeAttempt);
  state.story.startedAt = performance.now(); state.story.pausedMs = 0;
  state.try.needsPlay = false;
  if (lastPracticeAttempt) renderTryIntoPage();
  const endActions = document.getElementById("ug-story-end-actions");
  if (endActions) endActions.hidden = true;
  sharedAudio?.pause();
  const runId = ++state.story.runId;
  state.story.playing = true;
  state.story.paused = false;
  state.story.nextRequested = false;
  state.story.skipRequested = false;
  document.getElementById("ug-story-guide").hidden = false;
  document.getElementById("ug-story-pause").disabled = false;
  document.querySelector('[data-action="skip-story"]').hidden = false;
  document.querySelectorAll('[data-action="pause-story"]').forEach((button) => { button.textContent = "Pause"; });
  document.getElementById("ug-story-progress").textContent = "Getting the story ready";
  document.querySelector(".ug-story-progress-track")?.setAttribute("aria-valuenow", "1");
  document.getElementById("ug-story-progress-fill").style.width = "25%";
  document.getElementById("ug-story-caption").textContent = "Getting the current take ready to play…";
  document.getElementById("ug-story-next").hidden = false;
  activeStory = true;
  const storyButton = document.querySelector('[data-action="play-story"]');
  if (storyButton) { storyButton.disabled = true; storyButton.setAttribute("aria-busy", "true"); }
  const preparation = new AbortController();
  state.story.preparation = preparation;
  const abortPreparation = () => preparation.abort();
  token.signal.addEventListener("abort", abortPreparation, { once: true });
  if (eatFirst && storyAttempt) {
    setStoryStage(1, `Watch the goblin eat your ${window.UG_DATA.take.fillers} ums.`);
    showEatingSpotlight();
    document.getElementById("ug-spotlight-caption").textContent = `${window.UG_DATA.take.fillers} snacks on the menu`;
  }
  try {
    // Skip can leave this wait immediately while the take's bootstrap completes independently.
    await Promise.race([takeReady, new Promise((resolve) => preparation.signal.addEventListener("abort", resolve, { once: true }))]);
    if (!takeController.isCurrent(token) || preparation.signal.aborted) return;
    if (state.try.status === "error" && !storyAttempt) return;
    state.story.userTake = Boolean(lastPracticeAttempt);
    await loadStoryAudio(token, preparation.signal);
    if (!takeController.isCurrent(token) || preparation.signal.aborted) return;
    if (((!storyAudioContext || storyAudioContext.state !== "running") && !state.story.paused) || !storyAudioBuffers.original) {
      state.story.playing = false;
      state.try.needsPlay = Boolean(lastPracticeAttempt);
      hideEatingSpotlight(); document.getElementById("ug-story-guide").hidden = true;
      renderTryIntoPage(); scrollToElement("#ug-scene-try");
      if (!lastPracticeAttempt) showToast("Audio could not start. Try Play the story again.");
      return;
    }
    await runNarratedStory(runId, eatFirst);
  } catch (error) { if (takeController.isCurrent(token) && error.name !== "AbortError") showToast(friendlyError(error)); }
  finally {
    token.signal.removeEventListener("abort", abortPreparation);
    if (takeController.isCurrent(token) && state.story.runId === runId) {
      activeStory = false;
      if (state.story.playing) finishStory(runId);
      if (storyButton) { storyButton.disabled = false; storyButton.removeAttribute("aria-busy"); }
    }
  }
}

async function playEdit() {
  if (state.edit.playing) return;
  const token = takeController.current;
  const runId = ++state.edit.runId;
  scrollToElement("#ug-scene-edit");
  audioController.manual(sharedAudio);
  await takeReady;
  await cleanReady;
  if (!takeController.isCurrent(token) || state.edit.runId !== runId) return;
  animateEdit(runId);
  await playAudio("edit");
}

function cleanConclusion(attempt, clean) {
  const first = clean.passes?.[0];
  const last = clean.passes?.at(-1);
  const fillersRemoved = Math.max(0, Number(first?.fillers ?? attempt.fillers) - Number(last?.fillers ?? 0));
  const before = Number(clean.contentWordsBefore ?? attempt.spokenWords ?? 0);
  const after = Number(clean.contentWordsAfter ?? Math.max(0, Number(last?.words || 0) - Number(last?.fillers || 0)));
  const words = before === after ? `Same ${after} content words` : `${after} of ${before} content words kept`;
  const seconds = Number(clean.removedSeconds || 0).toFixed(1);
  const checker = clean.mock ? "mock re-check" : "re-checked by Deepgram";
  return `${words}, ${fillersRemoved} fewer ums, ${seconds} seconds shorter — ${checker}.`;
}

function showCheckerComparison(attempt, clean) {
  if (!clean) {
    document.getElementById("ug-story-word-counts").textContent = "Edit not verified: no before/after check available.";
    document.getElementById("ug-story-changed-words").textContent = "Remaining fillers and changed content words are unknown.";
    document.getElementById("ug-story-comparison").hidden = false;
    return;
  }
  const beforeWords = Number(clean?.contentWordsBefore ?? attempt?.spokenWords ?? 0);
  const afterWords = Number(clean?.contentWordsAfter ?? beforeWords);
  const beforeFillers = Number(clean?.passes?.[0]?.fillers ?? attempt?.fillers ?? 0);
  const afterFillers = Number(clean?.passes?.at(-1)?.fillers ?? 0);
  document.getElementById("ug-story-word-counts").textContent = `Before: ${beforeWords} words + ${beforeFillers} ums  →  After: ${afterWords} words + ${afterFillers} ums`;
  const changes = clean?.changedWords || [];
  document.getElementById("ug-story-changed-words").textContent = changes.length
    ? `Changed: ${changes.map((change) => `‘${change.before ?? "—"}’ → ${change.after == null ? "—" : `‘${change.after}’`} (${Number(change.time || 0).toFixed(1)}s)`).join("; ")}`
    : "Changed: no content words.";
  document.getElementById("ug-story-comparison").hidden = false;
}

function finishStory(runId, completed = false) {
  if (state.story.runId !== runId) return;
  const comparisonVisible = !document.getElementById("ug-story-comparison").hidden;
  state.story.paused = false;
  state.story.playing = false;
  setStoryStage(4, state.story.userTake ? "Your result is ready. Listen back, or record another take." : "Your turn. Record or upload an answer and practice the same pause.");
  document.getElementById("ug-story-comparison").hidden = !comparisonVisible;
  if (window.UG_DATA.edit.passes.length) updateEditPass(window.UG_DATA.edit.passes.length - 1);
  scrollToElement(state.story.userTake ? "#ug-scene-edit" : "#ug-scene-try");
  document.getElementById("ug-story-pause").disabled = true;
  document.getElementById("ug-story-pause").textContent = "Pause";
  document.querySelector('[data-action="skip-story"]').hidden = true;
  document.getElementById("ug-story-next").hidden = true;
  const endActions = document.getElementById("ug-story-end-actions");
  if (endActions) {
    endActions.hidden = false;
    endActions.querySelector('[data-action="try-now"]').textContent = state.story.userTake ? "🎙 Record another take" : "🎙 Try it with your voice";
    document.getElementById(state.story.userTake ? "ug-scene-edit" : "ug-scene-try").appendChild(endActions);
  }
  document.getElementById("ug-story-guide").hidden = true;
  if (completed) updateStoryDuration(Math.round((performance.now() - state.story.startedAt - state.story.pausedMs) / 1000));
  hideEatingSpotlight();
  stopStorySource();
}

async function playEditedFallback(start, end, runId) {
  const fillers = window.UG_DATA.take.words.filter((word) => word.f && word.s < end && word.e > start);
  let cursor = start;
  for (const word of fillers) {
    if (state.story.runId !== runId || state.story.skipRequested || state.story.nextRequested) return;
    const keptEnd = Math.max(cursor, Math.min(end, word.s - 0.03));
    if (keptEnd > cursor) await playStoryRange(storyAudioBuffers.original, cursor, keptEnd, "ug-edit-clean-cursor", runId);
    cursor = Math.max(cursor, Math.min(end, word.e + 0.05));
  }
  if (cursor < end && state.story.runId === runId && !state.story.skipRequested && !state.story.nextRequested) await playStoryRange(storyAudioBuffers.original, cursor, end, "ug-edit-clean-cursor", runId);
}

async function runNarratedStory(runId, eatFirst = false) {
  const data = window.UG_DATA;
  const duration = Number(data.sample.durationSec) || storyAudioBuffers.original?.duration || 8;
  const preview = UGTake.previewRange(data.take.words, duration);
  const alive = () => state.story.runId === runId && !state.story.skipRequested;
  const scene = (number, caption, selector) => {
    setStoryStage(number, caption);
    if (selector) scrollToElement(selector);
  };

  resetTakeVisuals();
  if (!eatFirst) {
    scene(1, "Listen around the first um. Every glowing mark is a filler.", "#ug-scene-take");
    if (state.story.nextRequested) state.story.nextRequested = false;
    else await playStoryRange(storyAudioBuffers.original, preview.start, preview.end, "ug-take-cursor", runId);
    if (!alive()) { finishStory(runId); return; }
    state.story.nextRequested = false;
  }

  scene(1, "Now watch the goblin eat them. Each glowing transcript pill plays that exact filler.", "#ug-scene-take");
  showEatingSpotlight();
  const spotlight = document.getElementById("ug-spotlight-caption");
  const markers = [...document.querySelectorAll(".ug-filler-marker")];
  const total = markers.length;
  spotlight.textContent = `${total} snacks on the menu`;
  const introduction = await waitStory(1500, runId);
  if (!alive()) { finishStory(runId); return; }
  const mouth = document.getElementById("ug-hero-mouth");
  let ateEveryFiller = introduction !== "next";
  for (let index = 0; index < markers.length; index += 1) {
    if (!ateEveryFiller) break;
    if (!alive()) { finishStory(runId); return; }
    while (state.story.paused && alive() && !state.story.nextRequested) await wait(80);
    if (!alive()) { finishStory(runId); return; }
    if (state.story.nextRequested) { state.story.nextRequested = false; ateEveryFiller = false; break; }
    const marker = markers[index];
    const word = data.take.words[Number(marker.dataset.wordIndex)];
    if (!word) continue;
    const pill = document.querySelector(`#ug-spotlight-transcript [data-word-index="${marker.dataset.wordIndex}"]`);
    keepPillVisible(pill);
    pill?.classList.add("ug-spotlight-pill-target");
    spotlight.textContent = `Snack ${index + 1} of ${total}: ${word.t}`;
    const glow = await waitStory(index < 2 ? 500 : 160, runId);
    if (!alive()) { finishStory(runId); return; }
    if (glow === "next") { pill?.classList.remove("ug-spotlight-pill-target"); ateEveryFiller = false; break; }
    const pillFlight = animateSpotlightPill(pill, index < 2);
    const bite = playStoryRange(storyAudioBuffers.original, Math.max(0, word.s - 0.03), word.e + 0.05, "ug-take-cursor", runId);
    marker.classList.add("ug-marker-eaten");
    state.story.eaten = index + 1;
    setCounterValues(state.story.eaten, total ? data.take.per100 * state.story.eaten / total : data.take.per100);
    spotlight.textContent = `Goblin ate ${state.story.eaten} of ${total} fillers.`;
    if (document.getElementById("ug-hero-goblin")) {
      const hero = document.getElementById("ug-hero-goblin");
      hero.classList.add("ug-is-fed");
      hero.style.setProperty("--ug-fed-scale", (1 + 0.2 * state.story.eaten / Math.max(1, total)).toFixed(3));
    }
    const spotlightGoblin = document.querySelector(".ug-spotlight-goblin-art");
    spotlightGoblin?.style.setProperty("--ug-spotlight-scale", (1 + 0.045 * state.story.eaten).toFixed(2));
    await Promise.all([bite, pillFlight]);
    if (!alive()) { finishStory(runId); return; }
    if (state.story.nextRequested) { state.story.nextRequested = false; ateEveryFiller = false; break; }
    const spotlightMouth = document.getElementById("ug-spotlight-mouth");
    spotlightMouth?.classList.add("ug-chomp");
    const beatResult = await waitStory(index < 2 ? 500 : 200, runId);
    spotlightMouth?.classList.remove("ug-chomp");
    if (beatResult === "stopped") { finishStory(runId); return; }
    if (beatResult === "next") { ateEveryFiller = false; break; }
  }
  if (ateEveryFiller && state.story.eaten === total && storyAudioBuffers.burp) {
    const burpCaption = `Burp! That’s all ${total} of your ums, played back as one goblin burp.`;
    document.getElementById("ug-story-caption").textContent = burpCaption;
    spotlight.textContent = burpCaption;
    await playStoryRange(storyAudioBuffers.burp, 0, Math.min(5, storyAudioBuffers.burp.duration), "ug-take-cursor", runId);
    if (!alive()) { finishStory(runId); return; }
    if (!state.story.nextRequested) document.getElementById("ug-take-bubble")?.removeAttribute("hidden");
  } else if (ateEveryFiller && state.story.eaten === total) {
    const noBurp = `Goblin ate all ${total} of your ums. There’s no goblin burp recording for this take.`;
    document.getElementById("ug-story-caption").textContent = noBurp;
    spotlight.textContent = noBurp;
    document.getElementById("ug-take-bubble")?.removeAttribute("hidden");
  }
  state.story.nextRequested = false;
  if (!alive()) { finishStory(runId); return; }
  hideEatingSpotlight();

  scene(2, "The coach spots the pattern. It turns the habit into one small drill.", "#ug-scene-coach");
  if (await waitStory(7000, runId) === "stopped") { finishStory(runId); return; }
  await waitStoryTask(cleanReady, runId);
  if (!alive()) { finishStory(runId); return; }
  if (!state.story.nextRequested && cleanResult?.cleanAudioUrl && !storyAudioBuffers.edit) await waitStoryTask(loadStoryAudio(takeController.current, state.story.preparation.signal), runId);
  if (!alive()) { finishStory(runId); return; }

  const editCards = [...document.querySelectorAll("#ug-edit-content .ug-edit-wave-card")];
  scene(3, "The goblin made an edit. Hear the original, then the version it wants to keep.", "#ug-scene-edit");
  const ab = UGTake.abRange(data.take.words, storyAudioBuffers.original?.duration || duration);
  const abSpan = `${Math.round(ab.end - ab.start)} s`;
  document.getElementById("ug-story-caption").textContent = `Before: the same ${abSpan} with ${ab.fillers} um${ab.fillers === 1 ? "" : "s"} in it.`;
  editCards[0]?.classList.add("ug-ab-active");
  state.story.nextRequested = false;
  await playStoryRange(storyAudioBuffers.original, ab.start, ab.end, "ug-edit-original-cursor", runId);
  editCards[0]?.classList.remove("ug-ab-active");
  if (!alive()) { finishStory(runId); return; }
  const nextDuringAB = state.story.nextRequested;
  state.story.nextRequested = false;
  const editPreview = UGTake.editPreviewRange(data.take.words, ab, storyAudioBuffers.edit?.duration || data.edit.passes.at(-1)?.duration);
  const finalPass = data.edit.passes.at(-1);
  if (!nextDuringAB) {
    document.getElementById("ug-story-caption").textContent = cleanResult ? `After: the same part without the ums · ${finalPass?.fillers} ums left in the whole answer.` : "Preview only: the edited answer has not been verified.";
    editCards[1]?.classList.add("ug-ab-active");
    if (storyAudioBuffers.edit) await playStoryRange(storyAudioBuffers.edit, editPreview.start, editPreview.end, "ug-edit-clean-cursor", runId);
    else await playEditedFallback(ab.start, ab.end, runId);
    editCards[1]?.classList.remove("ug-ab-active");
    if (!alive()) { finishStory(runId); return; }
    state.story.nextRequested = false;
  }
  updateEditPass(Math.max(0, data.edit.passes.length - 1));
  scene(3, "Did the goblin eat any real words? It listens again to check.", "#ug-scene-edit");
  showCheckerComparison(storyAttempt, cleanResult);
  await waitStory(5000, runId);
  if (!alive()) { finishStory(runId); return; }
  finishStory(runId, true);
}

async function waitStoryTask(task, runId) {
  let settled = false;
  Promise.resolve(task).then(() => { settled = true; }, () => { settled = true; });
  while (!settled && state.story.runId === runId && !state.story.skipRequested && !state.story.nextRequested) await wait(80);
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
  const token = takeController.current;
  api("/api/history?visit=1").then((facts) => {
    if (!takeController.isCurrent(token)) return;
    window.UG_DATA.judge.sprite = { serverUptimeSeconds: facts.serverUptimeSeconds, previousVisit: facts.previousVisitSecondsAgo == null ? "first visit" : `${Math.floor(facts.previousVisitSecondsAgo / 3600)} h ago`, attemptsInLair: facts.count, keysOnSprite: 0 };
    document.getElementById("ug-judge-content").innerHTML = renderJudge(window.UG_DATA);
  }).catch(() => { if (takeController.isCurrent(token)) showToast("Sprite facts aren’t available right now."); });
}

function closeJudge() {
  const drawer = document.getElementById("ug-judge-drawer");
  if (!drawer) return;
  drawer.hidden = true;
  document.body.classList.remove("ug-drawer-open");
  state.lastFocus?.focus?.();
}

function silenceWav() {
  const sampleRate = 16000, samples = sampleRate * 3, buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
  return new Blob([buffer], { type: "audio/wav" });
}

async function showSilenceResult() {
  const token = takeController.current;
  const target = document.getElementById("ug-silence-result");
  if (!target) return;
  target.innerHTML = `<span class="ug-blocked-icon" aria-hidden="true">…</span><span role="status">Sending three seconds of silence to the goblin checker…</span>`;
  target.hidden = false;
  try {
    const result = await api("/api/analyze?question=Tell%20me%20about%20a%20difficult%20situation%20at%20work", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: silenceWav() });
    if (!takeController.isCurrent(token)) return;
    target.innerHTML = `<span class="ug-blocked-icon" aria-hidden="true">⊘</span><span>${escapeHTML(result.verdict === "not_a_win" ? window.UG_DATA.ui.silenceVerdict : "The checker returned a result that needs a closer look.")} The goblin does not shrink.</span>${goblinMarkup("ug-silence-mouth", "ug-goblin-stays-put")}`;
  } catch (error) { if (takeController.isCurrent(token)) target.innerHTML = `<span class="ug-blocked-icon" aria-hidden="true">!</span><span>${escapeHTML(friendlyError(error))}</span>`; }
}

function resetDemo() {
  const token = beginTake();
  storyAttempt = sampleSnapshot?.attempt || null; cleanResult = sampleSnapshot?.clean || null;
  window.UG_DATA = structuredClone(sampleSnapshot?.data || initialUGData); applyData();
  if (!sampleSnapshot) takeReady = bootstrapSample(token);
  document.getElementById("ug-story-guide").hidden = true;
  hideEatingSpotlight();
  document.querySelectorAll(".ug-scene-current,.ug-ab-active").forEach((element) => element.classList.remove("ug-scene-current", "ug-ab-active"));
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
  updateEditPass(window.UG_DATA.edit.passes.length - 1);
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
  if (action === "play-story" || action === "replay-story") { event.preventDefault(); playStory(); }
  if (action === "play-my-take" && lastPracticeAttempt) { event.preventDefault(); playStory({ eatFirst: true }); }
  if (action === "stop-audio") { event.preventDefault(); audioController.stopManual(); }
  if (action === "try-now") { event.preventDefault(); stopOtherMedia(); scrollToElement("#ug-scene-try"); document.querySelector('#ug-scene-try [data-action="record"]')?.focus({ preventScroll: true }); }
  if (action === "pause-story") { event.preventDefault(); setStoryPaused(!state.story.paused); }
  if (action === "skip-story") { event.preventDefault(); skipStory(); }
  if (action === "next-story") { event.preventDefault(); nextStory(); }
  if (action === "play-edit") { event.preventDefault(); playEdit(); }
  if (action === "reset") { event.preventDefault(); resetDemo(); }
  if (action === "open-judge") { event.preventDefault(); openJudge(); }
  if (action === "close-judge") { event.preventDefault(); closeJudge(); }
  if (action === "silence") { event.preventDefault(); showSilenceResult(); }
  if (action === "test-gate") {
    const token = takeController.current;
    const gateState = { status: "…", message: "Checking the connector gate…" };
    state.gate = gateState;
    document.getElementById("ug-judge-content").innerHTML = renderJudge(window.UG_DATA);
    const update = (value) => { if (!takeController.isCurrent(token) || state.gate !== gateState) return; Object.assign(gateState, value); document.getElementById("ug-judge-content").innerHTML = renderJudge(window.UG_DATA); };
    api("/api/gate-test", { method: "POST" }).then((gate) => update({ status: String(gate.status || (gate.ok ? 200 : "Blocked")), message: gate.error || "The connector gate responded." })).catch((error) => update({ status: "Error", message: friendlyError(error) }));
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
  if (event.target.closest('label[for="ug-audio-upload"],#ug-audio-upload')) unlockStoryAudio();
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

// Claude: delegated listener — the try panel is re-rendered, so a listener bound to the original <input> was lost.
document.addEventListener("change", (event) => {
  if (event.target?.id !== "ug-audio-upload") return;
  const file = event.target.files?.[0];
  event.target.value = "";
  analyzeUpload(file);
});
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
takeReady = bootstrapSample(beginTake());

// Claude: global guard — whenever any <audio>/<video> starts, stop every other sound (incl. story narration).
document.addEventListener("play", (event) => {
  const media = event.target;
  if (!(media instanceof HTMLMediaElement)) return;
  audioController.manual(media);
}, true);

// Claude: drag & drop onto the try panel (delegated, survives re-render).
let ugDragDepth = 0;
const ugInTry = (event) => Boolean(event.target?.closest?.("#ug-scene-try"));
const ugHasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");
document.addEventListener("dragenter", (event) => { if (!ugHasFiles(event) || !ugInTry(event)) return; event.preventDefault(); ugDragDepth += 1; document.getElementById("ug-dropzone")?.classList.add("ug-dropzone-active"); });
document.addEventListener("dragover", (event) => { if (!ugHasFiles(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = ugInTry(event) ? "copy" : "none"; });
document.addEventListener("dragleave", (event) => { if (!ugHasFiles(event) || !ugInTry(event)) return; ugDragDepth = Math.max(0, ugDragDepth - 1); if (!ugDragDepth) document.getElementById("ug-dropzone")?.classList.remove("ug-dropzone-active"); });
document.addEventListener("drop", (event) => {
  if (!ugHasFiles(event)) return;
  event.preventDefault(); // never let the browser navigate away to the dropped file
  ugDragDepth = 0; document.getElementById("ug-dropzone")?.classList.remove("ug-dropzone-active");
  if (!ugInTry(event)) { showToast("Drop the audio file on the “Upload a file” box."); return; }
  const file = event.dataTransfer.files?.[0];
  if (file) analyzeUpload(file);
});
