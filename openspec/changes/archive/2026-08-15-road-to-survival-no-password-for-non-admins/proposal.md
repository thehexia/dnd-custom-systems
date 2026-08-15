## Why

Every join or rejoin currently requires the room password, which means players have to be handed a secret just to resume a game they're already part of, and have to type a 6-character room code by hand every time. Only the room creator actually needs a secret to protect their identity; everyone else just needs to prove they know the room code and pick their existing username. Cutting the password requirement for regular players and letting them join from a clickable link removes friction from the most common path (a returning player rejoining) without weakening the one thing the password was protecting (the admin's identity).

## What Changes

- **BREAKING**: Non-admin join and rejoin no longer require a room password. A user supplying a valid room code and a username SHALL be admitted (as a new player, or reconnected to their existing player record) without a password, *unless* that username belongs to the room's admin.
- The room password is now checked only when the supplied username matches the room's admin (creator) username. Everyone else's join/rejoin requests are never checked against the password, whether or not one was supplied.
- Attempting to join/rejoin using the admin's username without a valid password is rejected with a distinct, more specific message than a plain invalid-room-code/password error, so the client can prompt specifically for the room password instead of showing a generic failure.
- On room creation, the creator is now shown a shareable join link (embedding the room code) in addition to the raw room code and password, so the creator can send friends a link instead of a code to copy.
- The client recognizes a room code carried in the page URL and skips the manual room-code entry step, prompting only for a username to join/rejoin.
- The client remembers, per room code, the last username used to join/rejoin that room (via browser local storage) and pre-fills it the next time that room's join form is shown in that browser.

## Capabilities

### Modified Capabilities
- `road-to-survival-room-access`: Join and rejoin no longer require a room password except when the supplied username is the room's admin username; adds a shareable join link returned on room creation, client recognition of a room code carried by URL, and browser-remembered per-room username.

## Impact

- **Server** (`games/road-to-survival/server/src/rooms/GameRoom.ts`): `onAuth` no longer unconditionally verifies the password for `action: "join"`; it must first resolve whether the supplied username is the room's admin (via `findRoomPlayer`) and only verify the password in that case. `JoinOptions.password` becomes optional.
- **Server** (`games/road-to-survival/server/src/db/rooms.ts`): may need a lookup to check admin status by room + username without pulling in unrelated fields.
- **Client** (`games/road-to-survival/client/src/net/room.ts`): `joinRoom` no longer requires a password argument for the common path; needs to surface the new "admin password required" failure distinctly from "invalid credentials" so the UI can react differently.
- **Client** (`games/road-to-survival/client/src/ui/roomGate.ts`, `main.ts`): join form drops the password field for the default path (only shown/required when reconnecting as admin); room-created screen builds and shows a join link (from the current origin + the room code) alongside the code and password; page-load logic reads a room code from the URL and jumps straight to a username-only join form; username is read from and written to local storage per room code.
- No schema migration needed — admin status is already tracked via `RoomPlayer.isAdmin`.
