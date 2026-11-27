# Um Goblin

> Every “um” you say feeds a goblin. Practice until it starves.

A personal speaking agent that lives on a [Fly.io Sprite](https://fly.io/sprites/). Record or upload an answer: the goblin eats the “um”s and “uh”s that Deepgram detects, one by one (you hear each one), burps them back as a goblin voice made of *your* fillers, then hands you an edit without them. The edit is transcribed again by the same engine and the detected word differences are shown — it can miss some, so listen before you use an edit.

Built for **Fly.io Hacksgiving 2026**.

**Live demo:** https://goblin-lair-b6ul3.sprites.app (runs on a Sprite; it may take a second to wake up)

## Try it

1. **Watch the story** — a real NASA answer (public domain): 9 fillers, eaten one by one, then the original vs. the goblin edit on the same 12-second stretch.
2. **Try it yourself** — click *Record*, or click / drag-and-drop an audio file (wav, mp3, m4a · ≤ 8 MB · ≤ 90 s). The goblin starts on your take automatically.
3. **I'm a judge** — connector gate test (a request through a non-existent connection ID → real `404` from the Sprites gateway; it shows the gateway is the only path to the key, it does not switch off the live connector), how the checker works (pass-by-pass re-check), and measured numbers.

## How it works

```text
Browser (record / upload)
   │
   ▼
Node server on a Sprite (no npm deps)
   ├─► Deepgram  ──via Sprites connector gateway──►  transcript + word timestamps (filler_words=true)
   ├─► ffmpeg: cut the speaker's own fillers → pitch-shift + echo → goblin burp (mp3)
   ├─► OpenRouter ──via Sprites connector gateway──►  coach: habit + one drill (validated JSON, rule fallback)
   └─► Goblin edit: cut filler spans → Deepgram listens again (≤3 passes)
          → word-level alignment (Levenshtein) of content words before/after → changed words reported
   attempts, audio and results persist on the Sprite disk
```

**Why a Sprite and connectors:** the provider keys never touch the app or the Sprite — the Sprites connector gateway injects them (`https://api.sprites.dev/v1/gateway/<provider>/<connection-id>/…`). Without a valid Deepgram connection there is no transcript, no timestamps, no goblin (the judge panel sends a live request through a bogus connection ID and shows the gateway's refusal). The Sprite sleeps when idle, wakes on HTTP, and keeps every take on disk.

## Measured (real runs, not mock)

| What | Result |
|---|---|
| um/uh detected on the NASA sample | 9 |
| Goblin edit on the NASA sample (Deepgram re-check per pass) | 9 → 2 → 0 detected fillers; transcript content words 62 → 61 (ASR count, re-checked with the same engine; the differing word is shown) |
| Synthetic TTS voices (6 voices × 2 tries) | fillers mostly **not** detected — why the demo uses a real recording |
| 11 real podcast clips (NASA HWHAP + Hacker Public Radio): transcript differences after the cut | 2 / 11 (suspected; not confirmed by ear — may be ASR noise) |
| Planted missing word caught by the checker | 8 / 11 (misses short words like “So”, “I”) |

Limits: English “um”/“uh” only (Deepgram does not tag “hmm”/“erm”). The re-check uses the same Deepgram model as detection, so shared mistakes are possible; word counts are transcript counts, not proof that the audio is intact. The edit shows a target; it is not proof that you improved. Free takes are not checked for topic.

## Run locally

Node.js ≥ 22. No npm packages.

```sh
MOCK=1 PORT=8080 node server.mjs      # offline: fixture transcript, deterministic coach
node --test                           # unit tests
```

Live mode (`MOCK=0`) expects to run on a Sprite with Deepgram and OpenRouter connectors whose policy allows that Sprite. Env: `DG_BASE`, `OR_BASE` (gateway URLs incl. connection id), `OR_MODEL`, `PORT`, `DATA_DIR`, `RATE_PER_IP`, `RATE_PER_DAY`.

## Deploy on a Sprite

Copy the repo onto the Sprite, install ffmpeg, then register the server as a service (inside the Sprite):

```sh
sprite-env services create goblin --cmd "$(command -v node)" --args server.mjs --dir "$PWD" --http-port 8080
```

## Quality checks

- `scripts/e2e-live.cjs` — Playwright end-to-end run against the live app on the Sprite (real connectors): every user path in `qa/QA-CHECKLIST.md`, including races (upload during the story, two uploads < 1 s apart, reset mid-upload), drag-and-drop, single-audio rule, A/B length. Last run: 51/51.
- `qa/` — the checklist, an independent code review, an independent UX review from live screenshots, and E2E notes.

## Privacy

Each browser gets a random HttpOnly session cookie; `/api/history` returns only that session's takes. Recordings and generated audio stay on the Sprite disk. Audio goes to Deepgram and transcript context to OpenRouter through the connectors. Simple per-IP and daily rate limits protect the credits.

## Credits

UI first drafted with v0 (committed unmodified in its own commit), then wired to the live pipeline. Sample audio: NASA, public domain. MIT license.
