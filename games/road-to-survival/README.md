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

Click anywhere on the game canvas to move your square — state is synced across all connected clients via Colyseus.

## Useful commands

- `npm run docker:down` — stop Postgres
- `npm run prisma:studio` — browse the DB in Prisma Studio
- `npm run dev:server` / `npm run dev:client` — run one side only
