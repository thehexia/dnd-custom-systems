## Context

Segment advancement today has exactly one path: `GameRoom.maybeAdvance()` (`games/road-to-survival/server/src/rooms/GameRoom.ts`), triggered from the `"ready"` message handler and from `onLeave` (so a disconnect can unblock advancement for the remaining players). It gates on `timeline.phase === "active"` and `players.every(p => p.ready)`, then either increments `timeline.segment` or flips `timeline.phase` to `"week-end"` at the week's last segment, and resets every player's `ready` flag. The admin-only `"resolve-week-end"` message handler is the existing precedent for an admin-gated message: it checks `player?.isAdmin` and `timeline.phase === "week-end"` before mutating state. See proposal.md - Why for motivation.

## Goals / Non-Goals

**Goals:**
- Let the admin step the current segment forward or backward by one without every player readying up.
- Reuse the existing forward transition (including the week-end entry at the last segment) rather than duplicating it.

**Non-Goals:**
- No arbitrary jump to a specific segment or week (see proposal.md - What Changes: exactly one step per trigger).
- No override usable during the week-end decision or game-over phases (per the clarified requirement).
- No persistence changes: the override only mutates the same `timeline`/`players` schema fields normal advancement already mutates.

## Decisions

**One message, two directions, sharing the forward path with `maybeAdvance`.** Add a single `"override-segment"` message with a `{ direction: "next" | "previous" }` payload, rather than two separate message types. `maybeAdvance`'s body (the "increment, or enter week-end at the last segment, then reset readiness" logic) is extracted into a small `advanceSegment()` helper that both `maybeAdvance` (still gated on all-ready) and the new handler's `"next"` branch call, so the week-end transition rule is defined once. The `"previous"` branch is new logic local to the handler: decrement `timeline.segment` when it's above 1 (no-op otherwise), then reset readiness the same way.

**Gating order mirrors `resolve-week-end`.** The handler checks, in order: `player?.isAdmin`, then `timeline.phase === "active"`. Either failing is a silent no-op (matching the existing `"ready"` and `"resolve-week-end"` handlers, which never send an error back to a rejected sender) — no new client-visible error/ack protocol is introduced.

**Backward clamp is a same-segment no-op, not an error.** Triggering backward at segment 1 leaves `timeline.segment` and `timeline.week` untouched and still resets readiness (harmless since nothing changed). Alternative considered: reject the attempt entirely like the phase/admin checks — rejected because "already at the start, nothing to rewind" is a boundary condition, not an authorization failure, and a silent clamp needs no new client-side error handling.

**Client control lives in `gameHud.tsx`, next to the existing admin roster panel.** `gameHud.tsx` already renders admin-only controls conditionally on `me?.isAdmin` (the week-end continue/death buttons). Two buttons ("◀" / "▶", or similar) are added to the same admin-gated block during the `"active"` phase, each sending `room.send("override-segment", { direction: ... })`. This keeps the admin-only affordance in the DOM-rendered HUD (easy to test and style) rather than adding more canvas-rendered, per-pixel-positioned controls to `MainScene.ts` like the nav bar tiles.

## Risks / Trade-offs

- [Extracting `advanceSegment()` touches the one code path every existing timeline-advancement test already exercises] → Mitigated by keeping the extracted function's behavior byte-for-byte identical to the current inline body of `maybeAdvance`; existing unit/integration tests for ready-based advancement must keep passing unchanged.
- [A misclick on "previous" during active play could undo a segment the party already resolved] → Accepted; this is an admin pacing tool, not a guarded destructive action, consistent with the admin already having unilateral week-end and password authority in this game.
