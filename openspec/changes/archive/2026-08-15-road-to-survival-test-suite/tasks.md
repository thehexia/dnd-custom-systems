## 1. Server unit tests (Vitest)

- [x] 1.1 Add `vitest` + `@vitest/coverage-v8` as devDependencies to `server/package.json` and create `server/vitest.config.ts` (node environment, includes `src/**/*.test.ts`, excludes `src/**/*.integration.test.ts`)
- [x] 1.2 Add `server/src/rooms/roomCredentials.test.ts`: room code/password length & alphabet, uniqueness across repeated calls, hash/verify round-trip, wrong-password verification fails
- [x] 1.3 Add `server/src/db/rooms.test.ts`: mock the Prisma client and verify `createRoom` retries on code collision up to `MAX_CODE_ATTEMPTS` then throws, `findRoomPlayer` uses case-insensitive matching, `saveRoomPlayerState` passes through `x`/`y`
- [x] 1.4 Add `test` script to `server/package.json` running Vitest against unit tests only

## 2. Client unit tests (Vitest + jsdom)

- [x] 2.1 Add `vitest` + `jsdom` as devDependencies to `client/package.json` and create `client/vitest.config.ts` (jsdom environment)
- [x] 2.2 Add `client/src/net/room.test.ts`: mock `colyseus.js`'s `Client`, verify `createRoom`/`joinRoom` map server errors to `RoomAccessError` with the correct `reason` (e.g. `admin-password-required`) vs. the generic case
- [x] 2.3 Add `client/src/ui/roomGate.test.ts`: verify join-link construction from `window.location`, per-room remembered-username get/set via `localStorage`, and that a room-access error surfaces the right message/reveals the password field when `reason === "admin-password-required"`
- [x] 2.4 Add `test` script to `client/package.json` running Vitest

## 3. Server integration tests (Testcontainers + real Postgres)

- [x] 3.1 Add `testcontainers`, `@testcontainers/postgresql`, and `@colyseus/testing` as devDependencies to `server/package.json`
- [x] 3.2 Add `server/test/integration/globalSetup.ts`: start a `postgres:16-alpine` Testcontainers container once for the run, run `prisma migrate deploy` against it, export the container's connection string as `DATABASE_URL` for the test process, and stop the container in teardown
- [x] 3.3 Add a second Vitest config `server/vitest.integration.config.ts` (or a Vitest project) that includes only `src/**/*.integration.test.ts` and wires up the global setup/teardown from 3.2
- [x] 3.4 Add `server/src/db/rooms.integration.test.ts`: create a room and room player through the real persistence layer and read them back; verify the `code` unique constraint and the `(roomId, username)` unique constraint are enforced by Postgres; ensure each test uses unique codes/usernames so tests don't interfere within the shared container
- [x] 3.5 Add `server/src/rooms/GameRoom.integration.test.ts` using `@colyseus/testing`: create a room via `onCreate`/`onJoin` with `action: "create"`, verify a room record and admin player are persisted; join with a new non-admin username and verify a player record is created without a password; attempt admin rejoin without/with the correct password and verify the `AUTH_FAILED` vs. success behavior against real hashed data
- [x] 3.6 Add `test:integration` script to `server/package.json` running the integration Vitest config

## 4. End-to-end automation tests (Playwright)

- [x] 4.1 Create `games/road-to-survival/e2e/` workspace with its own `package.json`; add `e2e` to the `workspaces` array in `games/road-to-survival/package.json`
- [x] 4.2 Add `@playwright/test` as a devDependency and `e2e/playwright.config.ts` with a `webServer` entry that starts the server (against a Testcontainers-provisioned Postgres, reusing the approach from 3.2) and the client dev/preview server before tests run
- [x] 4.3 Add `e2e/tests/create-and-join.spec.ts`: browser context A creates a room and captures the join link/code/password from the UI; browser context B opens the join link and joins with a username; assert both sessions observe each other's player state syncing
- [x] 4.4 Add `e2e/tests/admin-rejoin.spec.ts`: browser context A creates a room as the admin and disconnects; a new context attempts to rejoin with the admin's username and no password and asserts the password field is revealed and access is denied; retries with the correct password and asserts successful rejoin with restored state
- [x] 4.5 Add `test` script to `e2e/package.json` running Playwright

## 5. Orchestration and docs

- [x] 5.1 Add `test`, `test:unit`, `test:integration`, `test:e2e` scripts to `games/road-to-survival/package.json` that delegate to the workspace scripts added above
- [x] 5.2 Update `games/road-to-survival/README.md` with a "Testing" section documenting the four commands, that Docker must be running for `test:integration`/`test:e2e`, and that Testcontainers manages its own Postgres container independent of `docker-compose.yml`
- [x] 5.3 Verify `npm run test` from `games/road-to-survival/` passes all three suites locally end-to-end

## 6. OpenSpec rule update

- [x] 6.1 Add a `rules.tasks` entry to `openspec/config.yaml` requiring that any task introducing or changing behavior include a corresponding unit and/or integration test task, and that new Postgres-touching code be covered by an integration test rather than a mocked unit test alone
- [x] 6.2 Add a short note to `openspec/config.yaml`'s `context` naming the testing stack (Vitest, Testcontainers, Playwright) and where each suite lives, so future proposals for this repo reference the established tools
- [x] 6.3 Run `openspec validate --strict` (or equivalent) to confirm `config.yaml` is still well-formed after the edit
