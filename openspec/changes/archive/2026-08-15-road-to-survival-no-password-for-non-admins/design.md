## Context

`GameRoom.onAuth` (`games/road-to-survival/server/src/rooms/GameRoom.ts`) currently gates every `action: "join"` connection behind a single room-wide password check, before `onJoin` even knows whether the username is new or an existing player. `this.roomDbId` and `this.passwordHash` are already populated by `onCreate` before any client's `onAuth` runs (Colyseus runs `onCreate` once per room process, then `onAuth`/`onJoin` per connecting client). `db/rooms.ts#findRoomPlayer(roomId, username)` already does a case-insensitive lookup and returns the full `RoomPlayer` row, including `isAdmin`. The client (`net/room.ts`, `ui/roomGate.ts`) always collects and sends a password for `action: "join"`, and the room-created screen shows only the raw code and password, not a link. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Decide where the admin/non-admin branch is evaluated and how a distinct "admin password required" outcome reaches the client without overloading the existing generic invalid-access error.
- Decide how the join link is generated and how the client recognizes one on load.
- Decide the local-storage key scheme for remembered usernames and when it's read/written.

**Non-Goals:**
- No change to how the password itself is generated, hashed, or shown once at creation (`roomCredentials.ts` is untouched).
- No admin transfer, no room expiration, no rate limiting on repeated failed admin-password attempts — same non-goals as the original room-access change, still out of scope here.
- No server-side URL/origin awareness — the join link is built entirely client-side.

## Decisions

### 1. Evaluate the admin/non-admin branch in `onAuth`, reusing `findRoomPlayer`
`onAuth` already has `this.roomDbId` and `this.passwordHash` available, and `options.username` is present on `JoinOptions`. So `onAuth` calls `findRoomPlayer(this.roomDbId, options.username)` itself: if a matching row exists and `isAdmin` is true, the password is verified (missing or wrong → reject); otherwise `onAuth` accepts unconditionally, regardless of whether a password was supplied.

`onJoin` still independently calls `findRoomPlayer` today to decide new-vs-existing and to hydrate state. This introduces a second, near-identical query per connecting client. **Alternative considered**: cache the `onAuth` lookup (keyed by `client.sessionId`, which is already available in `onAuth`'s `client` param) on the room instance and have `onJoin` consume it instead of re-querying. **Rejected for now**: this only runs once per connection (not per movement/tick), so the extra indexed lookup is negligible, and avoiding the cache keeps `onAuth` and `onJoin` independently reasoned about rather than coupled through hidden instance state. Revisit if connection volume ever makes this a real cost.

### 2. Distinct rejection for "admin password required" via a fixed message string, not a new `ErrorCode`
Colyseus's `ErrorCode` enum is fixed by the library; reusing `ErrorCode.AUTH_FAILED` for both "wrong/missing admin password" and any other auth failure is unavoidable, so the two are told apart by message instead. `GameRoom.ts` gets a second exported-shape constant alongside `GENERIC_ACCESS_ERROR`, e.g. `ADMIN_PASSWORD_REQUIRED_ERROR`, thrown whenever the username resolves to the admin row and the password is missing or wrong. The client's `toRoomAccessError` (`net/room.ts`) already branches on `(code, message)` pairs (see the existing `username-taken` regex match against `MATCHMAKE_UNHANDLED`); it gains a branch matching `AUTH_FAILED` + this exact message string, mapped to a new `RoomAccessErrorReason` value `"admin-password-required"`. Exact string match is used (not a regex) since the server fully controls both message and client parser.

Missing-password and wrong-password for the admin username are **not** distinguished from each other — both produce the same `admin-password-required` outcome. Distinguishing them would let a client probe whether a guessed password is correct without knowing it belongs to the admin; collapsing them preserves the original design's "don't leak more than necessary" posture (see the archived room-access design's rejection-semantics decision) while still telling admin-username attempts apart from everything else, which is the whole point of this change.

### 3. `JoinOptions.password` becomes optional; unsupplied password is simply "no password", not an error, unless the admin branch is hit
`interface JoinOptions { action: "join"; code: string; username: string; password?: string }`. `client.joinRoom(code, username, password?)` in `net/room.ts` only includes `password` in the options object when the caller supplies one, so the default (non-admin) path never sends the field at all.

### 4. Join link is built entirely client-side from `window.location` + the room code
No server change is needed to produce the link: the room code is already returned to the creator via the existing `room-created` message. `roomGate.ts` constructs `` `${window.location.origin}${window.location.pathname}?room=${code}` `` and displays it (as text and/or a clickable anchor) next to the code and password on the room-created screen. **Alternative considered**: have the server compute and return a full URL. **Rejected**: the server (Colyseus WS endpoint) doesn't reliably know the public HTTP origin the client was loaded from (dev server port, future reverse proxy, etc.); the client already knows its own origin unambiguously.

On load, `main.ts`/`roomGate.ts` reads `new URLSearchParams(window.location.search).get("room")`. If present and non-empty, the gate skips straight to a join form pre-populated with that room code (shown read-only, not a text input) and asks only for a username; if absent, the existing Create/Join tabs behavior is unchanged (manual code entry on the Join tab).

### 5. Password field is hidden by default and revealed only after an `admin-password-required` rejection
The join form (whether reached via link or manual code entry) has no password field on first render. On submit, `joinRoom` is called without a password. If the result is a `RoomAccessError` with reason `"admin-password-required"`, the form reveals a password input in place, shows a message explaining why, and lets the user resubmit (now including the password) without re-entering username/code. Any other error reason renders inline as before (generic message, form stays as-is).

### 6. Remembered username: `localStorage`, keyed per room code
Key scheme: `` `road-to-survival:lastUsername:${code}` `` (code is already uppercase/canonical, matching what the server stores). Written after a successful `create` or `join` resolves, using the code the session ended up with. Read whenever a join/rejoin form for a known code is shown:
- Link-based entry: code is known immediately from the URL, so the username field is pre-filled on render.
- Manual code entry (Join tab, no link): there's no known code until the user has typed one, so the code input's `input` event checks `value.length === 6` (the fixed code length) and, if so, looks up and pre-fills the username field at that point rather than only on blur/submit — this satisfies "pre-filled the next time that room's join form is shown" without a server round trip.

No expiry is applied to the stored value; it's simply overwritten on the next successful join/rejoin to that code, and a stale entry is harmless (worst case: a pre-filled username the user changes).

### 7. Copy-to-clipboard for the created room's credentials
Added during implementation, on request: each of the join link, room code, and room password on the room-created screen gets its own "Copy" button, using `navigator.clipboard.writeText` with a `document.execCommand("copy")` fallback (via a temporary off-screen `<textarea>`) for browsers/contexts where the Clipboard API is unavailable. Each button gives brief inline feedback ("Copied!"/"Copy failed") rather than a silent no-op, so a failed copy (e.g. clipboard permission denied) doesn't look identical to success.

## Risks / Trade-offs

- [Risk] Any user who knows a room's code can now join as any *new* username, or rejoin (resuming full prior state) as any *existing non-admin* username, with zero secret required — the room code is the only remaining gate for non-admin access. → Mitigation: this is the explicit intent of the request (regular players shouldn't need a password); the admin identity — the one identity actually worth protecting (it's the only one with elevated capability, per the archived design's non-goals) — still requires the password. Room codes remain unguessable at scale (6 chars from a 32-symbol alphabet) and rejection responses for bad codes stay generic.
- [Risk] The `admin-password-required` response necessarily reveals that a given username is the room's admin (that's required for the UX this change asks for — the client needs to know to prompt for a password). → Accepted trade-off: the admin's username is generally already known to the group they invited (they're the one who shared the room), so this leaks little beyond what participants already know.
- [Risk] The second `findRoomPlayer` query per connection (Decision 1) is a minor, accepted inefficiency, not a correctness risk.
- [Trade-off] Building the join link from `window.location` (Decision 4) means the link always reflects wherever the app is currently being served from — correct for the common case, but if the app is ever reachable at multiple public URLs simultaneously, links reflect whichever one the creator happened to load.

## Migration Plan

1. Server: relax `JoinOptions.password` to optional; move the password check in `GameRoom.onAuth` behind an admin-username lookup via `findRoomPlayer`; add the `ADMIN_PASSWORD_REQUIRED_ERROR` message constant.
2. Client: extend `RoomAccessErrorReason`/`toRoomAccessError` in `net/room.ts` for the new reason; make `password` an optional parameter of `joinRoom`.
3. Client: update `roomGate.ts` to (a) drop the default password field and reveal it only on `admin-password-required`, (b) detect a `?room=` URL param and skip manual code entry, (c) show a constructed join link on the room-created screen, (d) read/write the per-room-code `localStorage` username.
4. No database migration — `RoomPlayer.isAdmin` already exists and is already set correctly at creation time.
5. Rollback is reverting the code change; no persisted data shape changes, so no data migration to reverse.
