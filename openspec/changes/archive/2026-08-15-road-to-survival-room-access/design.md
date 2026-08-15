## Context

Road to Survival's server currently registers a single Colyseus room type, `"game"`, joined via `client.joinOrCreate("game")` with no options — everyone lands in the same shared process. `GameState`/`PlayerState` track only `x`/`y` per session. Postgres is already wired up via Prisma, but the only model is a scaffold `Player` table with a globally unique `username` and no room concept, exposed only by a debug `GET /players` endpoint. See proposal.md for why this needs to change.

## Goals / Non-Goals

**Goals:**
- Define how room create/join/rejoin map onto Colyseus's connection lifecycle (`onAuth`/`onCreate`/`onJoin`).
- Define the Postgres schema replacing `Player` with room-scoped identity.
- Define the persistence write/read path so a room's players and their state survive the live Colyseus process being disposed or the server restarting.
- Define how the room code and room password differ in generation, storage, and exposure.

**Non-Goals:**
- No room expiration/cleanup policy — rooms and their data persist indefinitely once created. Automatic archiving of stale rooms is future work.
- No admin capabilities beyond the flag itself (no kick, no transfer-admin, no close-room). This change only establishes who is admin.
- No password recovery — if the admin loses the password, the room is unreachable and a new one must be created.
- No visual/UI design — covered at implementation time, not here.

## Decisions

### 1. Reuse Colyseus's own connection flow instead of a separate REST layer
Use `onAuth(client, options)` on the `GameRoom` definition, invoked by Colyseus during `client.create()` / `client.joinOrCreate()`, rather than standing up parallel REST endpoints (`POST /rooms`, `POST /rooms/:code/join`) that hand off to Colyseus afterward.

Colyseus already accepts arbitrary `options` on connect and supports rejecting a connection with a `ServerError` (message reaches the client), so it covers everything a bespoke REST layer would add here. Two parallel session-establishment paths (HTTP + WS) would be extra surface for no real gain at this scale.

### 2. One room definition, an `action` discriminator, the room code doubles as the Colyseus `roomId`
Keep a single `GameRoom` registered as `"game"`. The options passed to `client.create()` / `client.joinOrCreate()`/`client.joinById()` include `action: "create" | "join"`:
- `create`: always starts a brand-new Colyseus process.
- `join`: used for both first-time join and rejoin. The client calls `client.joinById(code, options)` first; if a live process for that code exists, Colyseus routes directly to it. If not (`MATCHMAKE_INVALID_ROOM_ID`), the client falls back to `client.create("game", { action: "join", code, ... })`, which spins up a new process hydrated from Postgres by `code`.

**Revised from an earlier `filterBy(["code"])` design**: `filterBy` matches client-supplied options against fields set on the room's matchmaking listing *at creation time*, before `onCreate()` runs — it can't pick up a code the server only generates *inside* `onCreate()`. Colyseus does support overriding `this.roomId` during `onCreate()` (documented behavior), and `joinById`/`driver.findOne({ roomId })` is a first-class, well-defined lookup path — so the room's own `code` is used directly as its Colyseus `roomId` instead of introducing a separate metadata-filter mechanism. This was discovered while implementing task 3.3–3.4 by reading the Colyseus matchmaker source; it changes only the internal lookup mechanism, not any externally observable behavior described in the spec.

### 3. Room code and room password are different kinds of value
- **Room code**: short, human-typeable, unique identifier (6 uppercase alphanumeric characters, excluding visually ambiguous characters like `0/O`, `1/I`). Stored in plaintext — it's the lookup key for both `filterBy` matching and the Postgres `Room` row.
- **Room password**: separate random secret (8–10 alphanumeric characters), returned to the creator once in plaintext, then stored **hashed** (bcrypt) in Postgres — never persisted or logged in plaintext.

A single combined code+password value was considered and rejected: the code must be a plaintext, indexable lookup key (for `filterBy` and DB lookup), while the password must be a secret compared via hash — the two roles conflict if collapsed into one field.

### 4. Data model: `Room` + `RoomPlayer` replace `Player`
```
Room
  id           uuid (pk)
  code         string (unique)
  passwordHash string
  createdAt    datetime
  updatedAt    datetime

RoomPlayer
  id        uuid (pk)
  roomId    uuid (fk -> Room)
  username  string
  isAdmin   boolean
  x         float
  y         float
  createdAt datetime
  updatedAt datetime
  -- unique (roomId, lower(username))
```
This is a **BREAKING** change (per proposal): the old `Player` table and `/players` endpoint are removed, not kept alongside the new model — a parallel global-account concept would contradict "no accounts." `x`/`y` are explicit columns matching today's `PlayerState` shape rather than a generic JSON blob, since position is the only gameplay state persisted today; this can be revisited if richer state needs persisting later.

### 5. Persistence write/read path
- `onJoin`, new username: create a `RoomPlayer` row.
- `onJoin`, username matches an existing `RoomPlayer`: treat as rejoin — hydrate that session's `PlayerState` (`x`, `y`, `isAdmin`) from the stored row instead of creating a new one.
- On state change, and on `onLeave`/`onDispose`: write current `x`/`y` back to the `RoomPlayer` row. Flush on an interval rather than per movement message to avoid a Postgres write per input event; exact interval is an implementation detail for tasks.md.
- `onCreate` for a `join`-action room with no live process yet: load the `Room` row (by code) and its `RoomPlayer` rows to seed room metadata; live `GameState` entries are populated as each player actually connects via `onJoin`, not all at once.

### 6. Rejection semantics
Unknown room code and correct-code-wrong-password both reject with the same generic error, so a client response can't be used to enumerate valid codes. A duplicate-active-username attempt (someone already connected under that username in that room) is rejected without disturbing the existing session.

## Risks / Trade-offs

- [Risk] A 6-character code space is guessable if an attacker only needed the code. → Mitigation: the password is always required in addition to the code, and rejection responses don't distinguish bad-code from bad-password; per-code rate-limiting can be added later if abuse is observed.
- [Risk] Interval-based position flushing can lose the last few seconds of movement on a hard crash. → Mitigation: also flush on `onLeave`/`onDispose`, covering the common departure paths; a few seconds of drift on a hard crash is acceptable for this game.
- [Risk] Dropping the `Player` table loses existing scaffold data. → Mitigation: acceptable, since no real data exists yet; migration drops and recreates rather than attempting a data migration.
- [Trade-off] Coupling room lookup to Colyseus's `filterBy` matchmaking ties discovery to the real-time layer's internals rather than a standalone lookup service. Acceptable since Colyseus is already the chosen real-time layer and `filterBy` exists precisely for this case.

## Migration Plan

1. Add a Prisma migration dropping `Player` and creating `Room` and `RoomPlayer`.
2. Remove the `/players` endpoint and global `Player` usage from `server/src/index.ts`.
3. Update `GameRoom` (`onAuth`, `onCreate`, `onJoin`, `onLeave`, `onDispose`) and `GameState`/`PlayerState` (add `isAdmin`) per Decisions 1–5.
4. Update the client's `net/room.ts` to expose `createRoom(username)` and `joinRoom(code, username, password)` in place of `joinGameRoom()`, plus minimal UI to collect the relevant inputs for create vs. join/rejoin.
5. No rollback data concerns since no production data exists yet; rollback is reverting the migration and code together.
