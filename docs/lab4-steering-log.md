### Incident 1: OpenAPI Contract Mismatch and JSON Error Handling

- **Initial Agent Output:** The earlier API implementation left the POST reservation OpenAPI request schema looser than the backend validation and did not return the standard `ErrorResponse` for malformed JSON. The later read-only verification audit found the schema mismatch and marked the malformed JSON response as unverified.

- **Root Cause:** The schema described `resourceId` and `userId` as plain strings, even though the service requires a valid MongoDB ObjectId and the controller rejects empty or whitespace-only `userId` values. It also did not spell out the controller's date-time constraints. Express parses JSON before the reservation controller runs, so malformed JSON bypassed the controller's error response and reached Express's default error handler.

- **Remediation Prompt:**

```text
Your previous read-only verification audit identified a FAIL in the OpenAPI request schema and an unverified malformed JSON error response.

I want you to correct these specific issues before submission.

1. Inspect POST /api/v1/reservations validation in the controller/service and compare it with docs/openapi.yaml.
2. Fix the OpenAPI schema so resourceId, userId, startTime, and endTime constraints accurately reflect the implemented behavior. In particular, resourceId must satisfy the actual MongoDB ObjectId validation and userId must not be empty.
3. Inspect Express JSON parsing and error handling. Ensure malformed JSON returns HTTP 400 using our existing ErrorResponse structure rather than Express's default error body.
4. Add regression tests covering the corrected request contract and malformed JSON.
5. Add a test for the GET /api/v1/resources HTTP 500 error path, which your audit identified as missing.
6. Preserve all four implemented APIs and their existing behavior.
7. Do not introduce new dependencies or use TypeScript any.
8. Run npm run build, npm test, and git diff --check.

IMPORTANT FOR LAB 4 FAILURE-LOOP DOCUMENTATION:
- Explain exactly which prior output or assumption was incorrect.
- Explain why the error occurred.
- Describe the changes that resolved it.
- Report the precise verification results.
- Do not invent previous errors or remediation prompts.
- Do not claim this prompt fixed an earlier unrelated error.
- Do not create the steering log yet.

Do not perform live database writes, commit, or push changes.

Report the files changed and any remaining issues.
```

- **Resolution:** `docs/openapi.yaml` now documents a 24-hex-character `resourceId`, a non-whitespace `userId`, the accepted date-time syntax, and the rule that `endTime` must follow `startTime`. `src/app.ts` registers `src/middleware/json-error.middleware.ts` after `express.json()` so malformed JSON returns HTTP 400 with the existing `{ code, message }` `ErrorResponse` shape. Regression tests cover those request constraints, malformed JSON, and the GET resources HTTP 500 path. `npm run build` passed; `npm test` passed 4 of 4 top-level tests; and `git diff --check` passed. The tests use mocked database operations, so live MongoDB behavior remains unverified. This prompt addressed this incident; it did not fix earlier self-corrected build errors.
