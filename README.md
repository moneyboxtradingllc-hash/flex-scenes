# Flex Scenes

Private, local-first character and media studio. Mission 2 runs entirely on deterministic local mock providers; it does not require a GPU or provider credential.

## Development

`npm run dev` serves the app locally. SQLite data is stored in `data/flex-scenes.db`; local fixture, generated, and imported media live under `public/` and are deliberately excluded from Git where mutable.

## Live adapter readiness

`Seedream5Provider` and `Seedance25Provider` are intentionally not implemented. Before either adapter is added, obtain official, current provider information for: authentication, endpoint and verified model ID, input schema, reference-media upload/URL rules and ordering, supported capabilities, async polling/callback behavior, response/error/output schema, usage/pricing data, and rate limits. The application already normalizes those boundaries through provider capabilities, generation requests/results, jobs, lineage, and the usage ledger.
