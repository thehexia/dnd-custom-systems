## Context

Segment selection is pure client-side UI state: `MainScene.selectedSegment` is never sent to the server, and the server has no concept of "selected segment" at all (`games/road-to-survival/server/src/rooms/GameRoom.ts` only tracks the room's actual current segment/week/phase). The nav bar tiles (`MainScene.setUpNavBar`, `games/road-to-survival/client/src/scenes/MainScene.ts:273-307`) and the jump-to-current-day button (`MainScene.create`, `MainScene.ts:138-149`) are both made interactive unconditionally today, with no awareness of `isAdmin`. `isAdmin` is already synced per-player on `room.state.players` (`server/src/rooms/schema/GameState.ts`) and already used client-side the same way this change needs it, in `client/src/ui/gameHud.tsx:28,102,117` (`room.state.players.get(room.sessionId)` / find by `sessionId`, read once player state is ready).

See proposal.md - Why for motivation.

## Goals / Non-Goals

**Goals:**
- Gate the nav bar's tile selection and the jump-to-current-day control so only the admin's client treats them as interactive.
- Keep non-admin clients' selected segment locked to the room's actual current segment at all times.

**Non-Goals:**
- No server-side enforcement of this restriction. See Decisions.
- No change to what content a segment shows, or to the week-end/game-over admin-only flows already covered by `road-to-survival-room-access` and the existing timeline-board spec.
- No change to `timeline.ts`'s pure helper functions (`nextSelectedSegment`, `tileVisualState`, `computeVerticalTileLayout`); see Decisions.

## Decisions

**Client-only enforcement, no server round-trip.** Segment selection already never reaches the server today (it's local view state, not shared game state), so there is nothing server-side to protect. Adding a server message/ack for this would introduce network round-trips and new server state for a feature that has no effect on shared room state. A non-admin who bypasses the client restriction via devtools only spoils content for themselves, which is an acceptable ceiling for a local co-op game with no adversarial players. Alternative considered: validate an admin flag on a `select-segment` server message — rejected as unneeded complexity for a value that stays entirely client-local.

**Gate at the interactivity setup, not inside the handlers.** `setUpNavBar` and the jump button's setup will only call `.setInteractive(...)` / `.on("pointerdown", ...)` for those objects when the local player is admin, rather than always attaching the handler and checking `isAdmin` inside it. This satisfies the spec's "SHALL NOT present this control as an interactive affordance to non-admin players" (no hand cursor, no click response at all) rather than a silent no-op click. Determine `isAdmin` once, from `room.state.players.get(this.room.sessionId)?.isAdmin`, at the same point `whenTimelineReady` already waits for state to be populated (`MainScene.ts:159-164`); admin status is fixed for a room's lifetime (`road-to-survival-room-access`), so a single read at scene setup is sufficient and no reactive subscription is needed.

**No change to `nextSelectedSegment`'s logic in `timeline.ts`.** Its existing rule — follow the current segment whenever `selectedSegment` is `null` or still equal to the last-known current segment, otherwise keep the manual selection — already produces "always track current" for a non-admin once `selectSegment()` is simply never called for them (because tile/jump interactivity is gated out per the previous decision). Adding an `isAdmin` parameter to `nextSelectedSegment` would duplicate that gating for no behavioral difference.

**Jump button interactivity setup moves out of `create()`.** Today the jump button's `.setInteractive().on(...)` is attached synchronously in `create()`, before player state is guaranteed loaded. It moves into the `whenTimelineReady` callback (alongside `setUpNavBar`), where `isAdmin` is available, so its interactivity can be conditioned the same way as the tiles.

## Risks / Trade-offs

- [A non-admin can still read ahead by inspecting `room.state` in devtools, since the server has no concept of "selected segment" to restrict] → Accepted; this is a UI convenience for the party, not an anti-cheat boundary, consistent with the Non-Goals above.
- [Determining `isAdmin` once at setup means it won't update if admin status somehow changed mid-session] → Accepted; admin status is fixed for a room's lifetime per `road-to-survival-room-access`, and a rejoin creates a fresh `MainScene` instance anyway.
