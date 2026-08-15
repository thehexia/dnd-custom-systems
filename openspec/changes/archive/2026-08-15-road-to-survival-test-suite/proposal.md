## Why

`games/road-to-survival` has no automated tests today. Room-access logic (code/password generation, hashing, admin rejoin rules), persistence (Prisma/Postgres), and the client join/create flow all currently rely on manual verification, so regressions in credential handling or state persistence can ship unnoticed. The project needs unit, integration, and end-to-end automation coverage, with integration tests running against a real Postgres via Testcontainers instead of a shared dev database, and the OpenSpec workflow needs a standing rule so future changes to this project keep that coverage up.

## What Changes

- Add a unit test suite (Vitest) for pure/isolable logic: server credential generation/hashing (`roomCredentials.ts`), room persistence helpers (`db/rooms.ts`) with Prisma mocked, and client join-gate helpers (`ui/roomGate.ts`, `net/room.ts`) with the DOM and `colyseus.js` mocked.
- Add a Testcontainers-backed integration test suite for the server: spins up a real `postgres:16-alpine` container per test run, applies Prisma migrations, and exercises `db/rooms.ts` and `GameRoom` (via `@colyseus/testing`) against that real database — no mocks for Postgres.
- Add an end-to-end automation test suite (Playwright) that drives the built client against a live server + Testcontainers-backed Postgres to cover the real user journey: create room → receive code/password/join-link → second browser joins via link → both see synced state → admin rejoin with/without password.
- Add npm scripts (`test`, `test:unit`, `test:integration`, `test:e2e`) at the workspace level(s) so each suite can run independently and together.
- **BREAKING (dev workflow only)**: contributors now need Docker available locally (already required for the dev Postgres) to run integration and e2e tests; no runtime/production behavior changes.
- Update `openspec/config.yaml` with a `tasks` rule requiring new/changed behavior to ship with corresponding unit and/or integration test tasks, and a short testing-conventions note in `context` (frameworks, Testcontainers usage, where suites live) so future proposals for this repo plan tests by default.

## Capabilities

### New Capabilities
- `road-to-survival-test-suite`: Automated unit, integration (Testcontainers/Postgres), and end-to-end test coverage for the road-to-survival client and server, plus the commands to run each suite.

### Modified Capabilities
(none — this change adds test coverage and tooling around existing behavior; it does not change any existing requirement in `road-to-survival-room-access`.)

## Impact

- **Affected code**: `games/road-to-survival/server/src/**` (new `*.test.ts` files, no production logic changes expected), `games/road-to-survival/client/src/**` (new `*.test.ts` files), new `games/road-to-survival/e2e/` workspace for Playwright specs.
- **New dependencies**: `vitest` (client + server), `@testcontainers/postgresql` + `testcontainers` (server), `@colyseus/testing` (server), `@playwright/test` (new `e2e` workspace), `jsdom` or `happy-dom` (client unit tests).
- **Config/tooling**: new `vitest.config.ts` per workspace, new `playwright.config.ts`, npm scripts in `games/road-to-survival/package.json` and each workspace `package.json`, `openspec/config.yaml` rules/context update.
- **Dev workflow**: Docker must be running for `test:integration` and `test:e2e` (Testcontainers manages its own Postgres container independently of `docker-compose.yml`).
- **No production runtime changes**: no changes to `GameRoom`, `db/rooms.ts`, `roomCredentials.ts`, or client UI behavior are anticipated as part of this change.
