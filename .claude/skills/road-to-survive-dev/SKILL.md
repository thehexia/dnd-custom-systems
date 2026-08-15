---
name: road-to-survive-dev
description: Start the road-to-survival stack for local development — Postgres (Docker), the Colyseus backend, and the Phaser/Vite frontend. Use whenever asked to run, start, or restart this game's backend/frontend/dev servers.
---

# road-to-survival dev environment

Brings up all three pieces of the stack: Postgres, the Colyseus backend, and the Phaser/Vite frontend. All paths below are relative to the repo root.

## 1. Node

`node`/`npm` are managed via nvm and are not on `PATH` by default in a fresh shell. Source nvm before any node/npm command:

```bash
source ~/.nvm/nvm.sh
```

## 2. Postgres

Check whether `road-to-survival-postgres` is already running before starting it:

```bash
docker ps --filter "name=road-to-survival-postgres" --format '{{.Names}}\t{{.Status}}'
```

If it's not listed, start it (requires Docker Desktop running):

```bash
cd games/road-to-survival && docker compose up -d
```

It listens on host port **5433**, not 5432 — port 5432 is already used by an unrelated `game_postgres_db` container from another project; do not stop or touch that container. Wait for healthy status:

```bash
docker ps --filter "name=road-to-survival-postgres" --format '{{.Names}}\t{{.Status}}'
```

## 3. Env file

`server/.env` is gitignored and won't exist on a fresh checkout. Create it from the example if missing:

```bash
[ -f games/road-to-survival/server/.env ] || cp games/road-to-survival/.env.example games/road-to-survival/server/.env
```

## 4. Dependencies

If `games/road-to-survival/node_modules` doesn't exist yet, install:

```bash
cd games/road-to-survival && npm install
```

## 5. Backend (Colyseus)

Runs on `ws://localhost:2567`, with a monitor UI at `http://localhost:2567/monitor`.

```bash
cd games/road-to-survival && npm run dev:server
```

Launch this with the Bash tool's `run_in_background: true` — it's a long-running watch process (`tsx watch`) and must not block. Confirm it came up with:

```bash
curl -s http://localhost:2567/health
```

Expect `{"ok":true}`.

## 6. Frontend (Vite)

Runs on `http://localhost:5173`.

```bash
cd games/road-to-survival && npm run dev:client
```

Also launch with `run_in_background: true`. Confirm with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Expect `200`.

## 7. Report

Tell the user both URLs once confirmed:
- Backend: ws://localhost:2567 (monitor: http://localhost:2567/monitor)
- Frontend: http://localhost:5173

## Stopping

```bash
pkill -f "tsx watch src/index.ts"   # backend
pkill -f "vite$"                    # frontend
cd games/road-to-survival && docker compose down   # postgres (data persists in the postgres_data volume)
```
