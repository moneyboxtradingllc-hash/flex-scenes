# Provider contracts (offline implementation)

ByteDance base families are distinct from gateway deployments. Flex Scenes treats Seedream 5.0 Pro and Seedance 2.5 as families; HotAPI and MuAPI deployments are routes with independent capability manifests.

HotAPI: Seedream text/image-edit contracts are async tasks with `Authorization: Bearer`, idempotency keys, polling at `/v1/tasks/{id}`, optional webhooks, and hosted HTTPS image references. Seedream Edit accepts images only. HotAPI Seedance reference routing is represented as image/audio-only: a selected reference video is intentionally incompatible.

MuAPI Omni: `POST /api/v1/seedance-2.5-spicy-omni-reference`, `x-api-key`, then poll `/api/v1/predictions/{request_id}/result`. Its documented lists are up to 30 images, 10 videos, and 10 audio files. The dry-run payload uses `images_list`, `videos_list`, and `audios_list`.

All live clients are dry-run by default. Before enabling any live submission, verify current credentials, pricing, upload/URL publication rules, endpoint availability, webhook-signature algorithm, full task schemas, and rate limits with the provider's official documentation.
