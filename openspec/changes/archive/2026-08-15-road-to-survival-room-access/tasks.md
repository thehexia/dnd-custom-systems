## 1. Database Schema

- [x] 1.1 Replace the `Player` model in `server/prisma/schema.prisma` with `Room` (`id`, `code` unique, `passwordHash`, `createdAt`, `updatedAt`) and `RoomPlayer` (`id`, `roomId` FK, `username`, `isAdmin`, `x`, `y`, `createdAt`, `updatedAt`, unique on `(roomId, username)` case-insensitive)
- [x] 1.2 Generate and apply a Prisma migration dropping `Player` and creating `Room`/`RoomPlayer`
- [x] 1.3 Add a Prisma query helper module (e.g. `server/src/db/rooms.ts`) with functions to create a room, find a room by code, find/create a `RoomPlayer` by `(roomId, username)`, and upsert a player's persisted state

## 2. Room Code & Password Generation

- [x] 2.1 Add a room code generator (6-character uppercase alphanumeric, excluding `0/O/1/I`) with a uniqueness retry loop against `Room.code`
- [x] 2.2 Add a room password generator (8–10 character random alphanumeric secret)
- [x] 2.3 Add password hashing/verification helpers (bcrypt) used when storing and validating the room password

## 3. Server: Room Lifecycle

- [x] 3.1 Extend `GameState`/`PlayerState` (`server/src/rooms/schema/GameState.ts`) with `username` and `isAdmin` fields on `PlayerState`
- [x] 3.2 Implement `onAuth(client, options)` on `GameRoom`: for `action: "create"`, accept a username and no other credentials; for `action: "join"`, require `code`, `password`, `username` and validate the password hash against the `Room` row, rejecting unknown code and wrong password with the same generic error
- [x] 3.3 Implement `onCreate(options)`: for `action: "create"`, generate a unique code/password, create the `Room` row, and use it as this room process's own Colyseus `roomId` so it is directly addressable by code; for `action: "join"` with no prior in-memory state, load the `Room` row from Postgres by code to seed the same `roomId`/password hash (see design.md note on this deviation from the originally planned `filterBy` mechanism)
- [x] 3.4 (superseded — see 3.3 note) Room lookup for `action: "join"` uses `client.joinById(code, ...)` with a client-side fallback to `client.create(..., { action: "join", code, ... })` when no live process is found for that code, rather than `filterBy` matchmaking
- [x] 3.5 Implement `onJoin(client, options)`: if the username matches an existing `RoomPlayer` in this room, hydrate `PlayerState` (`x`, `y`, `isAdmin`) from that row (rejoin); otherwise create a new `RoomPlayer` row and a fresh `PlayerState` (join); reject if the username is already actively connected in this room
- [x] 3.6 For a newly created room, mark the creating player's `PlayerState.isAdmin` and `RoomPlayer.isAdmin` as true
- [x] 3.7 Send the generated `code`/`password` to the creating client once, on successful creation (e.g. via a one-time message or the `onAuth`/`onJoin` response payload), never persisting the plaintext password
- [x] 3.8 Implement periodic persistence: flush each connected player's current `x`/`y` to their `RoomPlayer` row on an interval
- [x] 3.9 Implement `onLeave`/`onDispose` persistence: flush current state to `RoomPlayer` before removing from `GameState`/disposing the room

## 4. Server: Cleanup of Scaffold Code

- [x] 4.1 Remove the `GET /players` endpoint and global `Player` usage from `server/src/index.ts`
- [x] 4.2 Remove the now-unused global `Player` import/references across the server

## 5. Client: Networking

- [x] 5.1 Replace `joinGameRoom()` in `client/src/net/room.ts` with `createRoom(username)` (calls `client.create("game", { action: "create", username })`) and `joinRoom(code, username, password)` (uses `client.joinById(code, ...)` with a fallback to `client.create("game", { action: "join", ... })` when no live process exists for that code — see design.md's revised Decision 2)
- [x] 5.2 Surface room creation result (code, password, admin status) and join/rejoin errors (invalid code/password, username taken) to callers in a typed shape

## 6. Client: UI Flow

- [x] 6.1 Add a pre-game screen/state for choosing "Create room" (username only) vs "Join/Rejoin room" (code, username, password)
- [x] 6.2 On successful room creation, display the generated room code and password to the admin (clearly indicating it won't be shown again)
- [x] 6.3 On join/rejoin failure, display the returned error message and allow retry
- [x] 6.4 Wire the chosen flow into `MainScene` in place of the current unconditional `joinGameRoom()` call

## 7. Verification

- [x] 7.1 Manually verify: create a room, note code/password, open a second client, join with a new username, confirm both players see each other
- [x] 7.2 Manually verify: disconnect a joined (non-admin) player, rejoin with the same username/code/password, confirm position is restored and no duplicate player appears
- [x] 7.3 Manually verify: wrong password and wrong code are both rejected with the same generic error
- [x] 7.4 Manually verify: attempting to join/rejoin with a username already actively connected in that room is rejected without disconnecting the existing session
- [x] 7.5 Manually verify: restart the server after players have moved, then rejoin and confirm position state was restored from Postgres
