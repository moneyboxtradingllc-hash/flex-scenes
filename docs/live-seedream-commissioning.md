# Seedream commissioning boundary

Flex Scenes keeps the official model family (`Seedream 5.0 Pro`) separate from HotAPI's deployment label (`seedream-5.0-pro-spicy`). The production path is intentionally locked during commissioning.

## Re-verified 2026-09-23

- Text endpoint: `POST /v1/seedream-5.0-pro-spicy/text-to-image`
- Auth: `Authorization: Bearer …`
- Async task: creation returns a queued task; retrieve via `GET /v1/tasks/{id}`.
- Idempotency: `idempotency-key` must be stable for one identical logical submission.
- Text contract requires `prompt`, accepts `size` and optional `aspect_ratio`.
- The endpoint documentation says **2K only**, while HotAPI's model page advertises 2K/3K/4K at $0.12 per image. The commissioning request conservatively uses **2K** until an authorized live task validates the endpoint.

The first request remains a single, no-reference text image. Reference publication and image-edit mappings are represented separately and must run only after authorization; local canonical assets are never replaced by provider URLs.

No no-cost credential-validation endpoint was identified in the current public documentation. Flex Scenes therefore reports a stored credential as pending validation rather than sending a paid request.
