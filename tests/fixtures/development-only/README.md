# Development-only Reels playback fixture

`reel-playback-qa-5s.mp4` is a generated, silent H.264 test clip for browser playback QA. It is not an application media asset and is never added to SQLite. The local `/api/qa/reel-playback-fixture.mp4` route and the two ephemeral Reels are available only in development when `/reels?qaPlayback=1` is requested.

Regenerate it with `node scripts/generate-reels-qa-fixture.mjs` when a local FFmpeg build with the `libx264` encoder is available. No network, provider, or GPU is used.
