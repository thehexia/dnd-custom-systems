## Why

Road to Survival currently has a single hardcoded shared room ("game") with no way for a group of friends to play together privately, no notion of who is running the session, and no way to leave and come back. Players need a lightweight, no-account way to start a private game, share access with friends, and resume the same session later without losing progress.

## What Changes

- Add room creation: a user picks a username and creates a room; the server generates a shareable **room code** (public-ish identifier used to find the room) and a separate **room password** (secret, shown once at creation) used to gate entry.
- The creating user is automatically recorded as the room's **admin**.
- Add join: any user can join an existing room by supplying the room code, the room password, and a username of their choosing (unique within that room).
- Add rejoin: a user who previously joined (or created) a room can return later and resume their prior identity by supplying the room code, room password, and their existing username.
- **BREAKING**: Replace the current global, account-like `Player` model (globally unique username, no room concept) with room-scoped player records. Usernames are unique per room, not globally.
- Persist room identity (code, hashed password, admin) and per-player game state (currently position) in Postgres, so a room and its players' state survive the Colyseus room process being disposed or the server restarting — rejoining resumes exactly where a player left off.
- Remove/replace the current `client.joinOrCreate("game")` single-shared-room flow and the `/players` debug endpoint with room-scoped equivalents.

## Capabilities

### New Capabilities
- `road-to-survival-room-access`: Room creation, admin designation, join/rejoin via room code + password + username, and persistence of room and player state so sessions can be resumed.

### Modified Capabilities
(none — this is a new capability area; no prior specs exist for this project)

## Impact

- **Server** (`games/road-to-survival/server`): new Prisma models replacing `Player` (`Room`, `RoomPlayer`); new HTTP or Colyseus `onAuth`-based create/join/rejoin flow; `GameRoom` gains state hydration on create and periodic/on-leave/on-dispose persistence; `/players` endpoint removed or reworked.
- **Client** (`games/road-to-survival/client`): new UI/flow for entering a username to create a room, and for entering room code + username + password to join/rejoin; `net/room.ts` gains create/join/rejoin functions replacing `joinGameRoom()`.
- **Database**: new migration replacing the `Player` table with `Room` and `RoomPlayer` tables.
