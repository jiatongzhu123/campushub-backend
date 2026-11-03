# Lab 6 refactoring evidence

## Context optimization

- Root `CLAUDE.md` now points to the shared rules in `AGENTS.md` and maps the full-stack source. Whitespace word counts changed from 102 to 52 and 235 to 262, respectively (337 to 314 combined).
- `.cursorignore` excludes dependencies, builds, coverage, lockfiles, historical logs, temporary files, maps, bundles, and generated API output. Source, tests, shared declarations, and handwritten `docs/openapi.yaml` remain visible.
- `AGENTS.md` gives Codex explicit source-scoping instructions; automatic `.cursorignore` support is not assumed. A fresh `rg --files --ignore-file .cursorignore src` query returned 18 backend source/test files without generated or dependency paths. Token savings were not measured.

## Audit and implementation

| Area | Before | After |
| --- | --- | --- |
| Controller errors | Four generic outer catches and two identical `sendError` helpers | Typed `HttpError` and terminal `src/middleware/errorHandler.ts`; expected statuses/messages and `{ code, message }` bodies retained |
| Booking form | 169 lines; creation, feedback, guards, cleanup, and rendering together | 121 lines; `useCreateReservation` owns the mutation lifecycle |
| Reservation list | 207 lines; fetching, cancellation, retries, and rendering together | 116 lines; `useReservations` owns request state and actions; grouping/cards/styles stay in the component |
| API interfaces | Repeated unions, resource/error shapes, creation fields, and inconsistent reservation optionality | One handwritten `shared/types/api.d.ts` with type-only compatibility re-exports |
| Transport errors | JSON/network error parsing already centralized in `campushubApi.ts` | Kept unchanged; hooks format operation-specific feedback |

The malformed-JSON middleware remains separate and precedes the routers; the general error handler follows them. Service business logic, queries, overlap comparisons, cancellation semantics, and Mongoose schemas were preserved.

Creation requests have four required client-supplied string fields. Serialized responses additionally require readonly `id` and `status`. Persistence documents retain `ObjectId` and `Date`; no runtime implementation or dependency was added to the shared layer. Existing tsconfig files and the `dist/app.js` entry-point location are unchanged.

The approved creation hook body is unchanged by the final list extraction. Successful creation still notifies the parent after form unmount; local resets remain mounted-only. The list's request key, `isCurrent` cleanup, cancellation lock, retry increment, feedback messages, and success reload were copied without behavioral edits. Grouping and JSX were compared against their originals and remain unchanged.

## Verification after post-submission review

| Directory | Command | Result |
| --- | --- | --- |
| Root | `npm test` | PASS: 27 tests, 0 failures/skips |
| Root | `npm run build` | PASS |
| `client/` | `npm test` | PASS: 6 tests, 0 failures/skips |
| `client/` | `npm run lint` | PASS (existing Oxlint script) |
| `client/` | `npm run build` | PASS: TypeScript and Vite production build |
| Root | `git diff --check` | PASS; Windows LF-to-CRLF notices only |

The final backend `npm test` summary reports 27 tests and 27 passes, with zero failures, cancellations, skips, or todos. Node counts five top-level tests (including the error-handler parent) and 22 nested subtests. The earlier 23-test result preceded three compressed-body cases and the parser-like route `Error` case; nesting is included in both totals.

The frontend build used the previously approved execution outside the sandbox because Vite's Windows helper encounters `spawn EPERM` inside it. No configuration or dependency workaround was added.

Backend tests cover exact 400/404/409/500 JSON contracts, malformed JSON, resource filters, overlap and adjacent-slot behavior, serialization, cancellation idempotency/slot reuse, rejected values, and headers-sent delegation. The review added real HTTP tests for oversized JSON (413), unsupported charset/encoding (415), invalid gzip/deflate/Brotli bodies (400), and parser-like route rejections that must remain generic 500s. Frontend tests cover local time validation/conversion, non-JSON API errors, and exact booking/cancellation feedback.

## Post-submission corrections

- Direct HTTP comparisons of the parser middleware sequence from `b030efb^` with the submitted handler reproduced a regression: parser 400/413/415 responses became 500. The handler now checks parser-stage HTTP error metadata, retains those statuses, and returns fixed public `{ code, message }` bodies. Route errors cannot acquire a trusted status by carrying parser-like metadata. Unknown errors stay sanitized; malformed-JSON middleware is unchanged. The current six parser regression subtests pass with their original statuses; this does not claim a recorded pre-fix run of the complete final suite.
- Lab 6 commit `b030efb` was pushed to GitHub, and the student confirmed Canvas submission. Follow-up corrections require independent approval before publication.
- Comparison with the pre-Lab-6 source confirmed unchanged reservation request keys, cleanup and cancellation logic, component render trees, routes, models, API client, and date utility. No frontend implementation or shared declarations needed changing.

## Limits and remaining work

- Backend database operations are mocked. No live MongoDB or browser end-to-end run was performed.
- No DOM implementation, React test renderer, Testing Library, or browser runner is installed. `react-dom/test-utils` only wraps `act`; it does not provide a renderer or DOM. The existing Node tests cannot reliably mount these hooks or exercise their effects. No dependencies, fake hook dispatcher, or lifecycle-coverage claims were added.
- Existing non-atomic booking conflict-check/save behavior documented in `docs/openapi.yaml` remains unchanged. Repeated reservation serialization and resource-list fetching were not refactored.

## Manual lifecycle plan (not executed)

Use an isolated test database and browser Network tools to delay responses; use controlled API failures for the failure cases. Record requests and visible state for each case:

1. With an available resource, user A, and valid times, delay creation and submit twice rapidly. Expect one POST, disabled controls, then the exact success message, cleared inputs, and a reservation-list refresh.
2. Delay a creation POST, switch resource or user, and enter new form values before completing the old request. Expect the replacement form's values/feedback to stay intact and the parent to refresh after the old creation succeeds.
3. Delay user A's reservation GET, switch to B, finish B's response first, then A's. Expect only B's bookings. Repeat with a stale A failure; it must not overwrite B's success. Also complete a booking while a list GET is pending so the parent triggers another GET; finish the newer GET first and check the older result is ignored.
4. Fail a current list GET, then use Try again. Expect loading, followed by current data or the current error; old errors/results must not reappear.
5. Delay cancellation and click twice rapidly. Expect one PATCH, disabled cancel buttons, the exact success message, and a new GET. The cancelled booking must remain visible in the cancelled group after refresh.
6. Fail creation/cancellation, then retry successfully. Expect the existing operation-specific feedback, released request guards, and restored controls. Switch users while cancellation is pending and finish it afterward; old action feedback must not appear for the new user.

The app retains pre-existing React StrictMode development effect replays, which can duplicate initial GETs; those are distinct from duplicate POST/PATCH mutations. These manual checks do not substitute for automated React lifecycle coverage and are not recorded as passed.
