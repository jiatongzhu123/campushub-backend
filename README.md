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

## Browser E2E checks

From the repository root, install dependencies with `npm install`, then install the Playwright browsers with `npx playwright install chromium firefox webkit`. Run `npx playwright test` (or `npm run test:e2e`). Playwright builds and starts the Express app on `127.0.0.1:3000`, starts Vite on `127.0.0.1:5173`, and checks the app in Chromium, Firefox, and WebKit. Both ports must be free.

The E2E API uses its own temporary `mongodb-memory-server` database and ignores any ambient `MONGODB_URI`; it does not need a local MongoDB service or a `.env` file. It seeds three study rooms and three 3D printers before listening. Each browser project uses its own room and printer. An endpoint mounted only by the E2E launcher clears reservations before each reservation test, including repeated runs in one Playwright session; it checks that Mongoose is connected to the E2E memory database before deleting anything. The conflict test then creates its initial reservation through the real API. Browser tests use the `America/Los_Angeles` timezone and derive tomorrow's local booking window in the browser. A Playwright reporter removes the current run's marked MongoDB data directory after the web servers stop, including on Windows where Playwright force-terminates them. If the Playwright runner itself is forcibly terminated, or the API is killed before it writes the ownership marker, cleanup cannot be guaranteed.
