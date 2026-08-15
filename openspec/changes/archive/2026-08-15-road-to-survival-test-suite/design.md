## Context

See proposal.md - Why. Relevant current state:
- `server/` is ESM + TypeScript (`NodeNext` module resolution), Prisma → Postgres, Colyseus rooms.
- `client/` is Vite + TypeScript + Phaser, talking to the server via `colyseus.js`.
- No test runner, test config, or CI currently exists anywhere in the repo (`.github/` is absent).
- Local Postgres runs via `docker-compose.yml` on port 5433, used only for manual dev today.
- npm workspaces are declared in `games/road-to-survival/package.json` (`client`, `server`).

## Goals / Non-Goals

**Goals:**
- One test runner across client and server so contributors learn a single tool.
- Integration tests must run against a real Postgres with zero shared state between runs or machines (Testcontainers, not the dev `docker-compose` instance).
- End-to-end tests must exercise the real client bundle and real Colyseus server process, not mocks.
- Each suite runnable in isolation and via one combined command.
- OpenSpec proposals for this repo default to including test tasks going forward.

**Non-Goals:**
- Setting up CI (GitHub Actions or similar) — this change only makes the suites runnable locally/by any future CI; wiring an actual pipeline is a separate change.
- Load/performance testing of the Colyseus room.
- Visual regression testing of the Phaser canvas.
- Changing any production behavior in `GameRoom`, `db/rooms.ts`, `roomCredentials.ts`, or the client UI.

## Decisions

### Test runner: Vitest (client + server)
Vitest over Jest: native ESM/TS support with no transform config needed (the server is already `"type": "module"` + `NodeNext`, which Jest handles poorly without extra ts-jest/babel wiring), fast watch mode, and a Jest-compatible API so it's familiar. Both `client` and `server` workspaces get their own `vitest.config.ts` and `vitest`/`@vitest/coverage-v8` devDependency; there is no shared root config since the workspaces have different environments (`node` for server, `jsdom` for client DOM tests).

### Integration Postgres: Testcontainers (`@testcontainers/postgresql`)
Alternatives considered:
- **Reuse the dev `docker-compose` Postgres**: rejected — couples test runs to a manually-started, stateful, shared instance; not safe for parallel runs or CI.
- **In-memory/SQLite substitute**: rejected — Prisma schema and queries (e.g. `mode: "insensitive"` filtering, `@@unique` constraint behavior) are Postgres-specific; a different engine would validate different behavior than production.
- **Testcontainers** (chosen): starts a real, disposable `postgres:16-alpine` container per test run (matching the image already used in `docker-compose.yml`), yields a connection string, and is torn down automatically. Runs identically on a laptop or CI runner as long as Docker is available.

Integration setup: a Vitest global setup file starts one Postgres container for the whole integration run (not one per test file, to keep runtime reasonable), runs `prisma migrate deploy` against it to build the schema, and exposes the resulting `DATABASE_URL` to tests via `process.env`. Global teardown stops the container.

### Colyseus room testing: `@colyseus/testing`
`GameRoom` logic (`onCreate`/`onAuth`/`onJoin`/`onLeave`) is tested through Colyseus's official testing helper (`boot`/`ColyseusTestServer`), which drives real room lifecycle methods and real client connections in-process, pointed at the Testcontainers Postgres via the Prisma client. This avoids reimplementing Colyseus's matchmaking/auth pipeline in a hand-rolled harness and keeps the integration tests close to real server behavior.

### End-to-end: Playwright, new `e2e` npm workspace
A new `games/road-to-survival/e2e/` workspace (added to the root `workspaces` array) holds Playwright specs and its own `playwright.config.ts`. Playwright's `webServer` option boots the built client (`vite preview` or `vite dev`) and the Colyseus server as part of test startup, pointed at a Testcontainers-provisioned Postgres (reusing the same global-setup approach as the integration suite). Two Playwright `browserContext`s simulate the two independent browser sessions needed for the create/join scenarios. Playwright is chosen over Cypress for native multi-context (multi-tab/multi-user) support, which this game's core scenario (two players in one room) requires.

### Test file placement
Co-locate unit tests next to source (`src/**/*.test.ts`) in both `client` and `server`, matching common Vitest convention and keeping test/source proximity obvious. Integration tests live in `server/src/**/*.integration.test.ts` (or a `server/test/integration/` directory if co-location gets noisy — decided during implementation) so `test:unit` can glob-exclude them by filename pattern instead of needing a separate directory tree.

### npm scripts
Each workspace (`server`, `client`, `e2e`) gets `test` (and `server` additionally gets `test:integration`); the root `games/road-to-survival/package.json` gets orchestrating scripts:
- `test:unit` → `npm run test --workspace=server -- --exclude integration && npm run test --workspace=client`
- `test:integration` → `npm run test:integration --workspace=server`
- `test:e2e` → `npm run test --workspace=e2e`
- `test` → runs all three in sequence

(Exact script wiring finalized in tasks.md/implementation; this is the intended shape.)

### OpenSpec rule update
Add to `openspec/config.yaml`:
- A `rules.tasks` entry instructing that any task introducing or changing behavior must include a corresponding unit and/or integration test task, and that new Postgres-touching code must be covered by an integration test rather than a mocked unit test alone.
- A short addition to `context` naming the testing stack (Vitest, Testcontainers, Playwright) and suite locations, so future proposals reference the right tools instead of introducing a second stack.

This is a process/config change, not a spec-level behavior change, so it's covered in tasks.md rather than a spec delta.

## Risks / Trade-offs

- **Docker dependency for contributors** → Already required for local dev Postgres via `docker-compose`; Testcontainers just uses Docker more (and automatically). Document the requirement in the workspace README as part of tasks.
- **E2E suite flakiness/slowness from booting real processes** → Keep the e2e suite small (the two core journeys in the spec delta), rely on Playwright's built-in retry/wait-for-selector primitives instead of manual sleeps, and let integration tests carry the bulk of Postgres-behavior coverage so e2e stays focused on the cross-process journey.
- **One shared Postgres container per integration run** → Tests must clean up their own rows (or use unique codes/usernames per test) to avoid cross-test interference within a run; call this out explicitly in tasks.md.
- **No CI to enforce the new OpenSpec testing rule automatically** → The rule is advisory/process-level (enforced by whoever reviews an OpenSpec change), not a technical gate. Acceptable for now since this repo has no CI at all yet; flagged as a natural follow-up, not blocking this change.
