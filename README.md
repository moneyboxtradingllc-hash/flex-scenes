# Flex Scenes

Flex Scenes is a private, local-first character and media studio for creating, organizing, and reusing image and video scenes alongside character conversations. Its current UI is backed by a shared SQLite media/job repository and deterministic mock providers.

## Local development

Requirements: Node.js 22 or newer and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev -- --port 3200
```

Open [http://localhost:3200](http://localhost:3200). The local development server defaults to mock generation; the live provider adapters are disabled unless their separately documented authorization and safety gates are deliberately configured. Do not put credentials in source files.

## Validation

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run start -- --port 3200
```

## Local data and media

The SQLite runtime database is `data/flex-scenes.db`. SQLite WAL/SHM files, the local provider secret store, and local DPAPI/credential-vault material are runtime-only. Generated outputs are written under `public/generated/`; imported uploads are written under `public/imports/`. Those paths are ignored by Git so conversations, database records, credentials, generated media, and imports stay on the local machine. `public/fixtures/` contains intentional, non-private SVG fixtures and remains tracked.

Back up local data using an appropriate private backup process. Never commit the runtime database, WAL/SHM files, local uploads, generated provider output, secret stores, `.env.local`, or credentials. `.env.example` contains names and safe defaults only; copy it locally and add credentials only to an approved local secret store.

## Provider architecture

Image/video provider requests, capabilities, normalized jobs, references, lineage, and usage records pass through the local provider/repository boundaries. Mock image/video providers are deterministic and cost `$0.00`. Seedream/Seedance and other live provider routes remain disabled by default; do not enable or submit paid work without completing the documented provider commissioning and authorization requirements. No GPU is required for local UI development or mock tests.

Provider contract and commissioning notes live in `docs/`.
