## 1. Server: admin-only password gate

- [x] 1.1 In `games/road-to-survival/server/src/rooms/GameRoom.ts`, make `JoinOptions.password` optional (`password?: string`).
- [x] 1.2 Add an `ADMIN_PASSWORD_REQUIRED_ERROR` message constant alongside `GENERIC_ACCESS_ERROR`.
- [x] 1.3 Rewrite `onAuth` so that for `action: "join"` it looks up the existing player via `findRoomPlayer(this.roomDbId, options.username)`; if found and `isAdmin` is true, verify the password (missing or wrong password throws `ServerError(ErrorCode.AUTH_FAILED, ADMIN_PASSWORD_REQUIRED_ERROR)`); otherwise accept without checking the password at all.
- [x] 1.4 Verify `onJoin`'s existing `findRoomPlayer` call and admin/state hydration logic still works unchanged (it already handles new-vs-existing and restores `isAdmin`/`x`/`y`).

## 2. Client: optional password + new error reason

- [x] 2.1 In `games/road-to-survival/client/src/net/room.ts`, change `joinRoom` to accept an optional `password` parameter and only include `password` in the join options when supplied.
- [x] 2.2 Add `"admin-password-required"` to `RoomAccessErrorReason` and branch `toRoomAccessError` to map `ErrorCode.AUTH_FAILED` + the exact `ADMIN_PASSWORD_REQUIRED_ERROR` message text to it (keep the existing fallback to `"invalid-credentials"` for other `AUTH_FAILED`/`MATCHMAKE_INVALID_ROOM_ID` cases).

## 3. Client: join form — drop default password, reveal on demand

- [x] 3.1 In `games/road-to-survival/client/src/ui/roomGate.ts`, remove the always-present password input from the join/rejoin form; submit without a password by default.
- [x] 3.2 On a `RoomAccessError` with reason `"admin-password-required"`, reveal a password input in the join form (with an explanatory message) and let the user resubmit the same code/username plus the password, without losing their entered values.
- [x] 3.3 Keep existing generic-error rendering for all other error reasons.

## 4. Client: shareable join link

- [x] 4.1 On the room-created screen in `roomGate.ts`, construct a join link as `` `${window.location.origin}${window.location.pathname}?room=${code}` `` and display it (as text, and/or a clickable/copyable element) alongside the existing room code and password.

## 5. Client: join-via-link flow

- [x] 5.1 On startup (`main.ts` or `roomGate.ts`), read `room` from `new URLSearchParams(window.location.search)`.
- [x] 5.2 If a room code is present in the URL, skip the Create/Join tab chooser and manual code entry: show the join form directly with the code fixed (read-only) and only a username field to fill in.
- [x] 5.3 If no room code is present, keep the existing Create/Join tabs with manual code entry on the Join tab, unchanged.

## 6. Client: remembered username per room

- [x] 6.1 Add small helpers to read/write `localStorage` under the key scheme `` `road-to-survival:lastUsername:${code}` ``.
- [x] 6.2 After a successful create or join/rejoin, write the username used under that room's code.
- [x] 6.3 When the join form is shown with a known code from a link, pre-fill the username field from `localStorage` if present.
- [x] 6.4 When the code is entered manually (Join tab), pre-fill the username field once the typed code reaches its full length (6 characters) and a stored value exists for it.

## 7. Client: copy-to-clipboard for room credentials

- [x] 7.1 Add a "Copy" control next to the join link, room code, and room password on the room-created screen in `roomGate.ts`; copy via `navigator.clipboard.writeText` with an `execCommand("copy")` fallback, and show brief inline feedback ("Copied!"/"Copy failed").

## 8. Verification

- [x] 8.1 Manually verify: creating a room, then rejoining as the admin username with no password is rejected with the admin-specific message and reveals the password field; the correct password then succeeds and restores admin state.
- [x] 8.2 Manually verify: a second, non-admin username can join fresh with just the code, and later rejoin with just the code + same username, with no password ever required.
- [x] 8.3 Manually verify: the room-created screen's join link, opened in a fresh browser context, lands directly on a username-only join form for the right room code.
- [x] 8.4 Manually verify: joining/rejoining a room in the same browser pre-fills the previously used username for that room's code, and does not leak that username into a different room's join form.
- [x] 8.5 Manually verify: each of the three "Copy" buttons on the room-created screen copies the right value to the clipboard, with visible feedback.
