LIVE E2E run 1 (scripts/e2e-live.cjs on the Sprite, real Deepgram/OpenRouter): 23/27.
FAIL A1 Offline preview visible on load; FAIL A2b "Hear the goblin edit" → "The edit audio isn’t available" on fresh load (no live sample bootstrap).
FAIL A4 console: TypeError: Cannot read properties of null (reading 'state') ×3 — reset sets storyAudioContext=null while playStoryRange safety interval still reads storyAudioContext.state (app.js ~150).
(D1 drawer close = test artifact, closes fine with real click.)
