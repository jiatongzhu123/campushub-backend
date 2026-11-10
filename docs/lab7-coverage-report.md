# CS 5500 Lab 7 Coverage Report

Generated on 2026-11-09 at 22:59 PST (`-08:00`) from an uncommitted working tree based on `f57e8c8`.

## Reproduce the results

From the backend repository root, run:

```text
npm ci
npm run build
npm test
npx jest --coverage
npx jest --runInBand --detectOpenHandles
```

The verified environment used Node.js `v24.21.0` and npm `11.19.1`. `npm ci` completed from `package-lock.json`. Jest uses `jest.config.ts`, transforms TypeScript with `ts-jest`, and starts a real `mongodb-memory-server` through `src/test/setup.ts`. Database tests query and write to the isolated in-memory MongoDB instance. They do not require Atlas credentials. The generated `coverage/` directory is ignored by Git; rerun `npx jest --coverage` to regenerate its detailed HTML and LCOV artifacts.

The companion `docs/lab7-jest-coverage.txt` is the console output of a successful `npx jest --coverage --runInBand` run on this working tree, with trailing table padding removed. It provides a compact machine-generated record alongside this explanatory report.

## Test results

`npm test` passed. Its legacy Node runner reported:

```text
tests 27
pass 27
fail 0
skipped 0
todo 0
```

The Jest runner reported:

```text
Test Suites: 4 passed, 4 total
Tests:       90 passed, 90 total
Snapshots:   0 total
```

The four Jest suites contain 2 MongoDB setup smoke tests, 33 reservation service tests, 4 resource service tests, and 51 Supertest route tests. The 90 Jest results comprise 89 ordinary passing tests and one deliberate `test.failing` for the documented concurrent-booking limitation. That expected-failure test runs real MongoDB overlap queries and inserts; its barrier waits for both requests to reach `save()` before releasing either insert. Setup or barrier errors occur outside `test.failing` and remain ordinary failures. A separate ordinary test confirms that both overlapping reservations actually persist. No Jest tests are skipped.

The Supertest suite includes four controlled service-error cases that exercise HTTP 500 handling with temporary spies. Its headers-sent delegation case uses an isolated Express probe; the other 50 tests request the CampusHub app created by `createApp()`.

`npx jest --runInBand --detectOpenHandles` also passed all 4 suites and 90 tests without reporting an open handle.

## Coverage

This is the text table produced by the verified `npx jest --coverage` run:

```text
----------------------------|---------|----------|---------|---------|-------------------
File                        | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------------------------|---------|----------|---------|---------|-------------------
All files                   |   99.37 |    98.78 |     100 |   99.37 |
 controllers                |     100 |      100 |     100 |     100 |
  health.controller.ts      |     100 |      100 |     100 |     100 |
  reservation.controller.ts |     100 |      100 |     100 |     100 |
  resource.controller.ts    |     100 |      100 |     100 |     100 |
 services                   |    98.7 |    96.15 |     100 |    98.7 |
  reservation.service.ts    |   98.42 |    95.45 |     100 |   98.42 | 111-112
  resource.service.ts       |     100 |      100 |     100 |     100 |
----------------------------|---------|----------|---------|---------|-------------------

Test Suites: 4 passed, 4 total
Tests:       90 passed, 90 total
```

`collectCoverageFrom` includes every implementation TypeScript file under `src/services/` and `src/controllers/`, including files without direct tests. It excludes tests and declaration files. The configured Jest thresholds require at least 90% statement and 90% branch coverage separately in each directory; both directories also exceed the lab's mandatory greater-than-80% requirement.

A controlled audit run temporarily overrode the two directory thresholds through Jest's CLI, setting services to 100% and controllers to 101%. All 90 tests still passed, but Jest exited with code 1 and printed separate statement and branch threshold failures for both `./src/services/` and `./src/controllers/`. This confirms the directory gates are active; the repository configuration remains at 90% for both metrics.

The only uncovered production statements are `src/services/reservation.service.ts` lines 111-112. They throw when a cancellation update returns no document but a subsequent read finds a reservation whose status is still not `CANCELLED`. The corresponding branch begins at line 110. Normal in-memory database operations did not produce that defensive race state, and no artificial test was added merely to raise coverage.

The reservation conflict check and insert are separate database operations. The API contract documents that simultaneous bookings can overlap. The known expected-failure test preserves the desired future invariant without changing production concurrency behavior.
