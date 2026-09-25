# Development-only Reels playback fixture

`reel-playback-qa-5s.mp4` is a generated, silent H.264 test clip for browser playback QA. It is not an application media asset and is never added to SQLite. The local `/api/qa/reel-playback-fixture.mp4` route streams only when `FLEX_SCENES_LOCAL_QA=1`; the two ephemeral Reels appear only when `/reels?qaPlayback=1` is requested on a mobile viewport. Keep the environment flag unset or `0` outside an intentional local QA session. Production defaults to a 404 response.

Regenerate it with `node scripts/generate-reels-qa-fixture.mjs` when a local FFmpeg build with the `libx264` encoder is available. No network, provider, or GPU is used.
