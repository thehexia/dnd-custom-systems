# Road to Survival

Multiplayer game: [Phaser 3](https://phaser.io/) client + [Colyseus](https://colyseus.io/) server, with Postgres (via Docker Desktop) for persistence through Prisma.

## Layout

- `client/` — Phaser 3 + Vite + TypeScript
- `server/` — Colyseus + Express + TypeScript, using Prisma to talk to Postgres
- `docker-compose.yml` — local Postgres instance

## Setup

1. Copy env file:
   ```
   cp .env.example server/.env
   ```
2. Start Postgres (requires Docker Desktop running):
   ```
   npm run docker:up
   ```
3. Install dependencies (from this directory):
   ```
   npm install
   ```
4. Generate the Prisma client and run the first migration:
   ```
   npm run prisma:migrate --workspace=server -- --name init
   ```
5. Run client + server together:
   ```
   npm run dev
   ```
   - Server: ws://localhost:2567 (monitor at http://localhost:2567/monitor)
   - Client: http://localhost:5173

The room shares one timeline: each day is split into a day segment and a night segment, and a week is 5 days by default (the admin can set a different number of days per week when creating the room). Click "Ready" when you're ready for the current segment — once every connected player is ready, the timeline advances. At the end of the week, the room admin decides whether the party continues to the next week or the game ends. All of this is synced across every connected client via Colyseus.

## Testing

- `npm run test:unit` — Vitest unit tests for `server/` and `client/`. No Docker or running services required.
- `npm run test:integration` — Vitest integration tests for `server/` against a real Postgres. Requires Docker: the suite provisions and tears down its own `postgres:16-alpine` container via [Testcontainers](https://testcontainers.com/), independent of `docker-compose.yml`/the dev database.
- `npm run test:e2e` — Playwright end-to-end tests that drive the real client in a browser against a real server and a Testcontainers-provisioned Postgres. Requires Docker.
- `npm run test` — runs all three suites in sequence.

Docker Desktop (or another local Docker daemon) must be running for `test:integration` and `test:e2e`; `test:unit` does not need it.

## Useful commands

- `npm run docker:down` — stop Postgres
- `npm run prisma:studio` — browse the DB in Prisma Studio
- `npm run dev:server` / `npm run dev:client` — run one side only
