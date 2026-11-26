# Um Goblin — spec (Claude, 24/11/2026)

Hackathon: Fly.io Hacksgiving 2026 (Weird Uncle award target). Must: runs on a Sprite + uses ≥1 Sprites connector. Deadline 2026-11-30 15:00 VN.

## One-line promise (top of page, 5-second test)
"Every 'um' you say feeds a goblin. Practice until it starves."

## How it works (real pipeline)
1. Browser records an answer (MediaRecorder) or picks a sample clip → POST audio to server.
2. Server → Deepgram **via Sprites connector gateway** (`DG_BASE` env, default `https://api.sprites.dev/v1/gateway/deepgram/eNpa5SKIon_1VgCUfzbNHQ`), `/v1/listen?model=nova-3&filler_words=true&punctuate=true`. No API key anywhere: gateway injects it. Words with start/end/confidence come back; fillers = word in {um, uh}.
3. Server cuts the user's own filler segments with ffmpeg (atrim each segment ±40/60ms → concat → asetrate pitch-down + aecho) = **the goblin's voice** (an mp3). Goblin size = fillers per 100 non-filler words.
4. Coach agent → LLM **via OpenRouter connector gateway** (`OR_BASE`, default `https://api.sprites.dev/v1/gateway/openrouter/pBZuIhRH7y-Dxhg7khei6Q`, path `/v1/chat/completions`, NO `/api`), model env `OR_MODEL` default `openai/gpt-4o-mini`. Input: question, transcript with filler positions/timestamps, previous attempts. Output strict JSON: `{habit: string (one concrete pattern, e.g. "um right before numbers"), evidence: [word indexes], drill: string (one exercise for the next take, ≤25 words), covered_points: bool, verdict: "fed"|"starving"|"not_a_win", goblin_line: string (≤15 words, in-character, cheeky)}`. Validate JSON; on invalid/timeout → fall back to a deterministic rule-based drill and mark `coach: "fallback"` visibly.
5. **Anti-cheat ("break it" case):** silence, <15 non-filler words, or LLM says the answer no longer covers the question → verdict `not_a_win`: goblin does NOT shrink, shows "Silence isn't a win — you skipped the answer." Fewer ums only count if the answer still answers.
6. Persistence on the Sprite disk: `~/goblin-data/` keeps each attempt (audio, deepgram json, goblin mp3, coach json) → "lair history" across sleep/wake. Show "The goblin slept N hours and still remembers your last attempts" (compute from last attempt time).

## Demo UX (follow hackathon-hq IDEA-PLAYBOOK §5 — this is the most important part, make it polished)
Single page, one main flow. Three clear entrances at top:
- **Watch the story (90s)** — default. Character card: a real person + everyday quote + situation. Two attempts of the SAME interview question ("Tell me about a difficult situation at work"): attempt 1 heavy ums → goblin grows, play the goblin made of those ums, coach names the habit + drill; attempt 2 → goblin shrinks, numbers before/after. Story audio comes from files in `samples/` (manifest `samples/manifest.json`: id, title, speaker label, license/source note, question, file). Story must work with whatever samples exist; ship with `spacewalk` (NASA public-domain audio, real human, 9 fillers) as a "real human example" sample. Character text lives in manifest so Claude can swap audio later without code changes.
- **Try it yourself (1 min)** — mic record (≤90s, show timer), same pipeline, results appear in the same layout. Also "upload a file" fallback.
- **I'm a judge** — proof panel: (a) connector gate: button runs the same clip with the Deepgram connector call deliberately pointed at a bogus connection id → shows the real error, "no connector, no goblin"; (b) Sprite facts: this app runs on a Sprite, wakes on HTTP, data persists on disk (show lair history count + disk path), keys never on the Sprite (gateway); (c) measured numbers table with labels REAL/SYNTHETIC/TARGET (e.g. our test: um/uh detection 11/12 on TTS, spacewalk 9 detected; Deepgram doesn't tag "hmm/erm" — limitation); (d) link to repo + README.
- **Reset** button: clears the in-page session (not the lair history), always visible.
- After each result show: big goblin (SVG, size + mood by fillers/100 words, idle animation, mouth moves while goblin audio plays), transcript with fillers highlighted (hover shows timestamp), 3 stat chips (fillers, per-100-words, answer covered ✓/✗), coach card (habit, drill, goblin_line), and "Next take" CTA. Before/after comparison row when ≥2 attempts.
- Visual: playful but clean. Dark "lair" theme with one accent color, good typography (system font stack ok), mobile-friendly (360px), no external CDNs needed (inline SVG). Loading states while analyzing (≤ few s). Clear error messages.
- Copy in English (judges are US). No jargon in the main flow; tech words only in the judge panel.

## Tech constraints
- Node ≥22, **no npm dependencies** (node:http, fetch, child_process for ffmpeg). Plain HTML/CSS/JS in `public/`.
- `server.mjs` serves on `PORT` (default 8080). Endpoints: `GET /`, static `/public/*`, `GET /api/samples`, `POST /api/analyze` (body = audio, `Content-Type` audio/*, query `?sample=<id>` alternative, `&question=`), `GET /api/history`, `POST /api/gate-test`, `GET /api/health`, audio file serving for goblin mp3/originals.
- `MOCK=1` mode: no network — Deepgram response read from `fixtures/<sample>.deepgram.json` (spacewalk exists) and coach from a deterministic stub; ffmpeg still used if present, else skip goblin audio gracefully. Used for tests and local dev (Codex has no network).
- Pure logic in `lib/` with unit tests via `node --test` (filler extraction, per-100 metric, verdict/anti-cheat rules, ffmpeg filtergraph builder, coach JSON validation/fallback, manifest loading). Tests must pass in `node:22-bookworm-slim` with no network.
- 8 MB request limit (gateway limit), 120 s upstream timeout, max 90 s recording.
- README.md: what it is (promise + story), how it works diagram (text), why Sprite + connectors are essential, run locally (MOCK=1), deploy on a Sprite (service create with --http-port 8080, env vars), limitations (um/uh only, English, synthetic vs real numbers), privacy (recordings stay on your Sprite).
