## Context

`GameRoom` (`games/road-to-survival/server/src/rooms/GameRoom.ts`) currently owns a single `GameState` (`schema/GameState.ts`) with just a `MapSchema<PlayerState>`, where each `PlayerState` has `sessionId`, `username`, `isAdmin`, `x`, `y`. The only message handler is `"move"`, which the client sends on canvas click; `MainScene.ts` renders each player as a colored rectangle at `(x, y)` and moves it on state change. State is periodically flushed to Postgres via `saveRoomPlayerState` on a 5s interval and on leave/dispose, storing only `x`/`y`.

This change adds shared timeline state to the room and replaces the click-to-move interaction with ready-up-driven segment advancement, per proposal.md.

## Goals / Non-Goals

**Goals:**
- Add server-authoritative timeline state (week, segment, days-per-week, per-player ready flags, week-end decision state) to `GameState`, synced to all clients via Colyseus schema.
- Let the room admin set the number of days per week at room creation (default 5), and derive the week's total segment count from it.
- Implement ready-up → all-ready → advance-segment logic, including the disconnect-recalculation and end-of-week decision-gate behavior from the spec.
- Give the admin a "resolve week-end" action distinct from a regular player action.
- Replace `MainScene`'s click-to-move rendering with a timeline board scene showing segment/day/week and ready controls, styled with a Catan-inspired palette and tile treatment.

**Non-Goals:**
- No survival/resource/health mechanic; the week-end decision stays a manual admin choice (see proposal.md).
- No persistence of timeline state to Postgres beyond what's needed for reconnect-within-session; long-term history/analytics of past weeks is out of scope.
- No new art pipeline — "Catan-esque" is delivered via layout, color, and Phaser primitives/graphics (rounded chunky tiles, warm palette, drop shadows), not commissioned illustration assets. Sourcing real art assets can follow in a later change.
- Player `x`/`y` fields are left in place (not removed) since deleting them touches persistence/migration concerns beyond this change's scope; they simply stop being written to by client input.
- No mid-game reconfiguration of `daysPerWeek`; it is set once at room creation and fixed for that room's lifetime.

## Decisions

**Timeline state lives on `GameState`, not per-player.** A `TimelineState` sub-schema (`daysPerWeek` default `5`, `week`, `segment` 1 through `daysPerWeek * 2`, `phase`: `"active" | "week-end"`) is added as a single field on `GameState`, matching the spec's "one shared timeline per room." Alternative considered: deriving segment/week from a server timestamp (pure time-based clock). Rejected because the clarified advancement rule is ready-up-based, not real-time, and a stored counter is simpler to reason about and test than clock math.

**`daysPerWeek` is set once, at room creation, via an optional `CreateOptions.daysPerWeek`.** Validated server-side in `onCreate`: any value that isn't a positive integer (including omitted) falls back to the default of 5. Stored on `TimelineState.daysPerWeek` and never mutated afterward — join options do not carry a `daysPerWeek`, since only the creator configures a new room. Alternative considered: a separate admin-only "configure week length" message sent after room creation. Rejected — allowing mid-game reconfiguration would require deciding what happens to a timeline already partway through a week under the old length (e.g., the current segment now exceeding the new total), which is unnecessary complexity for a first pass.

**Readiness is tracked per-player on `PlayerState`.** Add `ready: boolean` to `PlayerState` rather than a separate `MapSchema<boolean>` on `TimelineState`, since readiness is inherently a per-player-session fact and Colyseus already syncs `PlayerState` per session. Advancement is computed server-side by iterating `this.state.players.values()` (i.e., connected sessions) and checking `ready === true` for all — this naturally implements "disconnected players do not block advancement," since a disconnected player's `PlayerState` is removed from the map in `onLeave`.

**Advancement and week-end are computed in a single server-side check, invoked after every "ready" message and after every `onLeave`.** A private `maybeAdvance()` method: if not all connected players ready, no-op; if all ready and `segment < daysPerWeek * 2`, increment segment and reset all `ready` to false; if all ready and `segment === daysPerWeek * 2`, set `phase = "week-end"` (no segment change) instead of advancing. This keeps the state machine's transition logic in one place, matching the spec's requirement that entering the week's last segment with all-ready does not auto-advance.

**Week-end resolution is a separate message (`"resolve-week-end"`) gated on `player.isAdmin`, not overloaded onto `"ready"`.** Alternatives considered: reusing "ready" with a payload flag. Rejected — conflating a per-player readiness signal with an admin-only, room-wide decision invites bugs (e.g., accidental readiness after game-over) and the spec calls them out as distinct requirements ("Ready-up is disabled during the decision state").

**`"move"` handler is removed outright, not deprecated behind a flag.** Proposal marks this **BREAKING**; there are no external consumers of this prototype yet (single dev-stage game), so a compatibility shim adds cost without benefit. Existing `move` tests (`GameRoom.integration.test.ts`) are replaced with tests for `ready`/`resolve-week-end`.

**Game-over is modeled as `phase: "game-over"` on `TimelineState`**, a third phase value alongside `"active"` and `"week-end"`. All mutating handlers (`ready`, `resolve-week-end`) early-return when `phase === "game-over"`, satisfying "Game-Over State Is Terminal" directly rather than adding a separate boolean flag.

**Board rendering replaces `MainScene`'s per-player rectangles with a horizontal track of `daysPerWeek * 2` tiles (10 by default) plus a week banner.** Built with Phaser `Graphics`/`Rectangle`/`Text` primitives (rounded rects, layered fill + stroke, warm browns/tans/reds) rather than a UI framework, consistent with the existing Phaser-only client. Each tile's fill state (completed/current/upcoming) is derived from `timeline.segment` via `$(timeline).onChange`. Independently, each tile also gets a day or night base styling (e.g. lighter warm tones for day, darker cooler tones for night) from the segment→day/time-of-day helper (task 3.4), so the day/night rhythm reads clearly regardless of a tile's completed/current/upcoming state. A separate small overlay (reusing the `roomGate.tsx` Preact pattern already in the client) shows ready controls and, for the admin during `week-end`, the continue/death buttons.

## Risks / Trade-offs

- [All-ready gating can stall the party if a player alt-tabs and never readies] → Mitigation: not addressed in this change (no timeout/kick mechanic); acceptable for a first pass per the "stub it for now" scope decision, revisit if playtesting shows it's a problem.
- [Removing `"move"` changes the only currently-testable interaction, temporarily shrinking test coverage for GameRoom until new tests land] → Mitigation: tasks.md includes replacing `GameRoom.integration.test.ts` coverage as part of this change, not a follow-up.
- [Hand-rolled Catan-esque styling via Graphics primitives may look rougher than the "very Catan-esque" bar the user has in mind] → Mitigation: flagged as a Non-Goal (no art pipeline); acceptable as a first visual pass, with real art assets as explicit future scope.
- [Admin configures an unusually large `daysPerWeek` (e.g. 30), producing a very long tile track] → Mitigation: no upper bound enforced in this change; board rendering should handle horizontal scrolling/compression reasonably, but tuning for extreme values is left for later iteration if it comes up in practice.

## Open Questions

- Exact color palette / tile sizing for the Catan-esque board is left to implementation-time visual iteration; it doesn't change the spec, state machine, or task breakdown.
