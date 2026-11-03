# CampusHub Agent Instructions

Applies repository-wide.

## Stack and architecture

- Write application source in TypeScript; no raw JavaScript or `any`. Explicitly type parameters, returns, props, schemas, and documents.
- Backend: Node.js, Express, MongoDB via Mongoose. `src/app.ts` is the entry point.
- Routes map endpoints/middleware to controllers; no business logic. Controllers handle HTTP and delegate to services; no database/model access. Services handle business logic/data access through models; no HTTP handling. Models define schemas/interfaces only.
- Frontend: React/Vite in `client/src/`. Use functional components, explicit props interfaces, state/effect hooks, the typed `client/src/api/` client, and CSS Modules; global CSS is for base styles. Keep API calls out of JSX.
- Preserve resource filtering, booking, reservation listing/cancellation, loading/error/success states, and async cleanup. Keep `/api/v1` and handwritten `docs/openapi.yaml` compatible, including HTTP statuses and JSON errors.
- Await, return, or explicitly handle every promise; handle errors at the appropriate layer. No unhandled rejections.
- Add/install dependencies only with explicit approval. Do not hand-edit generated files.

## Context scope

- Start searches in `src/` and `client/src/` (e.g., `rg --files src client/src`); include `client/tests/`, configuration, and `docs/openapi.yaml` when relevant.
- Skip dependencies, builds, coverage, lockfiles, historical logs, temporary files, maps, and generated API/bundle output unless explicitly needed. Apply this scope explicitly in Codex; do not assume `.cursorignore` is honored.

## Checks and reporting

- Backend (root): `npm test`, `npm run build`.
- Frontend (`client/`): `npm test`, `npm run lint` (Oxlint), `npm run build`.
- Tests use Node's test runner. Builds write output; backend tests build first. Respect task-specific write restrictions.
- Summarize changes, rationale, validation, and compliance with these rules.
