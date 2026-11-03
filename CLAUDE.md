# CampusHub Context

Follow `AGENTS.md` for architecture, TypeScript/React rules, API compatibility, dependency approval, source scope, and test/build commands.

- Backend: Express/Mongoose in `src/`; entry `src/app.ts`.
- Frontend: React/Vite in `client/src/`; resource filtering, booking, reservation listing/cancellation.
- Booking and reservation UI: `client/src/components/BookingForm.tsx`, `client/src/components/UserReservations.tsx`.
- Typed API and interfaces: `client/src/api/`, `client/src/types/`; contract: handwritten `docs/openapi.yaml`.
