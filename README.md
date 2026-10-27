# CampusHub

CampusHub has an Express and Mongoose API at the repository root and a React, TypeScript, and Vite client in `client/`.

## Run locally

Set `MONGODB_URI` in the backend process environment to a reachable MongoDB database. The optional `PORT` variable defaults to `3000`. The project does not load `.env` files automatically; keep credentials out of Git.

In one terminal, from the repository root:

```powershell
npm install
npm run dev
```

In a second terminal:

```powershell
cd client
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173/`). Vite forwards `/api` requests to `http://localhost:3000`; the API routes use `/api/v1`.

## Features and checks

The client lists resources with type filters, books a selected resource for a local time window, shows a demo user's bookings, and cancels active reservations. The demo user ID is for this lab; the backend has no authentication. A resource's `isAvailable` flag does not guarantee that a selected time slot is free. The API contract is in `docs/openapi.yaml`.

Run `npm test` and `npm run build` at the root for backend checks. Run `npm test`, `npm run lint`, and `npm run build` in `client/` for frontend checks.
