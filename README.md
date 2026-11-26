# Um Goblin

> Every “um” you say feeds a goblin. Practice until it starves.

Um Goblin turns spoken filler words into a tiny practice loop. Watch a real NASA public-domain answer, see its nine “um” and “uh” fillers highlighted, then record or upload your own answer and try the drill.

## How it works

```text
Microphone or sample clip
        ↓
Um Goblin server ── Deepgram through the Sprites connector gateway
        ↓                                ↓
Transcript + filler timestamps       Coach through OpenRouter connector
        ↓
ffmpeg clips the speaker’s own fillers → pitch-shifted goblin voice
        ↓
Goblin edit removes filler spans → Deepgram re-checks up to three passes
        ↓
Attempt files and history on the Sprite disk
```

The Deepgram and OpenRouter connector gateways inject credentials. Keys do not live in this app. The app keeps each attempt, transcript response, coach result, and available audio under `~/goblin-data/` on the Sprite disk.

## Run locally

Requires Node.js 22 or newer. No npm packages are needed.

```sh
MOCK=1 PORT=8080 node server.mjs
```

Open `http://localhost:8080`. Mock mode uses `fixtures/spacewalk.deepgram.json` and a deterministic coach without network access. If ffmpeg is installed, it creates the goblin audio; without ffmpeg, filler counts and coaching still work and the audio control is omitted.

For live analysis, run with `MOCK=0` and configure the Sprite gateway URL environment variables `DG_BASE` and `OR_BASE` if using non-default connectors. `OR_MODEL` selects the OpenRouter model. `PORT` selects the HTTP port and `DATA_DIR` can override the lair-history directory.

## Deploy on a Sprite

Create a Sprite for this repository, then start the server as its persistent service with HTTP port 8080 exposed:

```sh
sprite service create --name um-goblin --cmd "node server.mjs" --http-port 8080
```

Set `PORT=8080`, `MOCK=0`, and optional `DG_BASE`, `OR_BASE`, and `OR_MODEL` in the Sprite service environment. Configure the Deepgram and OpenRouter Sprites connectors for the gateway URLs. The app uses the connectors as its credential boundary; do not put provider keys in the Sprite environment. A Sprite wakes on HTTP requests, and its disk keeps lair history across sleep and wake.

## Limits and privacy

- Today’s filler counter recognizes English “um” and “uh”; it does not count “hmm” or “erm”.
- The spacewalk detection count is a real Deepgram result. Synthetic TTS voices mostly did not trigger filler detection, which is why the demo uses a real recording.
- Goblin edit results are re-checked by Deepgram on every live run. Mock mode shows simulated counts and does not generate edited audio. An edit is not a second human attempt or proof of improvement.
- The coach’s coverage judgment uses the full transcript. Fallback coverage is labeled as an estimate; silence and answers with fewer than 15 non-filler words are always rejected as wins.
- Each browser gets a random HttpOnly session cookie. `/api/history` returns only that session’s attempts plus a global count; sample story audio is public. Recordings and generated audio are stored on your Sprite disk. Audio sent for live analysis or Goblin edit goes through the configured Deepgram connector; transcript context goes through OpenRouter.
- `ffmpeg` is optional. Without it, goblin audio playback is skipped without affecting analysis.
