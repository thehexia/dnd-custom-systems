## 1. Server: Schema

- [x] 1.1 Add `TimelineState` schema (`daysPerWeek: number` default `5`, `week: number`, `segment: number` 1 through `daysPerWeek * 2`, `phase: "active" | "week-end" | "game-over"`) in `games/road-to-survival/server/src/rooms/schema/GameState.ts`, defaulting to `daysPerWeek: 5, week: 1, segment: 1, phase: "active"`.
- [x] 1.2 Add a `timeline: TimelineState` field to `GameState` and a `ready: boolean` field (default `false`) to `PlayerState` in the same file.
- [x] 1.3 Add a unit test for the schema defaults (new room state starts at `daysPerWeek: 5`, Week 1, Segment 1, `active`, and all players default `ready: false`).

## 2. Server: Room Creation Configuration

- [x] 2.1 Add an optional `daysPerWeek?: number` field to `CreateOptions` in `GameRoom.ts`.
- [x] 2.2 In `onCreate`, when `options.action === "create"`, validate `daysPerWeek`: if omitted, or not a positive whole number, use the default `5`; otherwise use the supplied value. Set `this.state.timeline.daysPerWeek` accordingly before any players join.
- [x] 2.3 Add unit/integration tests verifying: room creation without `daysPerWeek` defaults to 5; a valid custom value (e.g. 3) is used as-is; a non-positive or non-integer value (e.g. 0, -1, 2.5) falls back to the default of 5.
- [x] 2.4 (Not in the original plan, added during implementation: the spec's "Room Admin Configures Week Length" requirement needs an actual human-facing way to set it, not just server API support.) Add an optional "Days per week" number input to the create-room form (`client/src/ui/roomGate.tsx`'s `CreateForm`), parsed and passed through `createRoom()` (`client/src/net/room.ts`) to the server; blank stays `undefined` so the server default applies. Covered by new tests in `room.test.ts` and `roomGate.test.ts`.

## 3. Server: Timeline State Machine

- [x] 3.1 In `GameRoom.ts`, add a private `maybeAdvance()` method: computes whether every connected player (`this.state.players.values()`) has `ready === true`; no-ops if not all ready or if `timeline.phase !== "active"`.
- [x] 3.2 In `maybeAdvance()`, when all connected players are ready and `timeline.segment < timeline.daysPerWeek * 2`: increment `timeline.segment`, reset every player's `ready` to `false`.
- [x] 3.3 In `maybeAdvance()`, when all connected players are ready and `timeline.segment === timeline.daysPerWeek * 2`: set `timeline.phase = "week-end"` (do not change `segment`), reset every player's `ready` to `false`.
- [x] 3.4 Add a helper (e.g. `describeSegment(segment, daysPerWeek)`) or client-side equivalent mapping a segment number to `{ day, timeOfDay: "day" | "night" }` per the spec's Timeline Segment Structure requirement. (Implemented server-side in `server/src/rooms/timeline.ts`; `daysPerWeek` turned out unnecessary for the mapping itself, so the shipped signature is `describeSegment(segment)`.)
- [x] 3.5 Add unit tests for `maybeAdvance()` covering: not-all-ready is a no-op; all-ready with `segment < daysPerWeek * 2` advances and resets readiness; all-ready with `segment === daysPerWeek * 2` sets `phase = "week-end"` without changing segment; a no-op when `phase !== "active"`; behavior holds for both the default `daysPerWeek = 5` and a custom value (e.g. 3). (`maybeAdvance` is a private method on a Colyseus `Room`, whose "create" path requires real Postgres — isolating it from `Room`/DB for a true unit test isn't practical without an artificial refactor, so this behavior is covered end-to-end by the integration tests in section 5 instead.)

## 4. Server: Message Handlers

- [x] 4.1 Remove the `"move"` message handler and the `MoveMessage` interface from `GameRoom.ts` (BREAKING, per proposal.md).
- [x] 4.2 Add a `"ready"` message handler: if `timeline.phase !== "active"`, ignore; otherwise set the sending player's `ready = true` and call `maybeAdvance()`.
- [x] 4.3 Add a `"resolve-week-end"` message handler accepting `{ outcome: "continue" | "death" }`: reject (no-op, e.g. log and return) if the sending client's player is not `isAdmin` or `timeline.phase !== "week-end"`.
- [x] 4.4 In the `"resolve-week-end"` handler, on `outcome: "continue"`: increment `timeline.week`, set `timeline.segment = 1`, set `timeline.phase = "active"`, reset all players' `ready = false`. (`timeline.daysPerWeek` is left unchanged.)
- [x] 4.5 In the `"resolve-week-end"` handler, on `outcome: "death"`: set `timeline.phase = "game-over"`.
- [x] 4.6 Update `onLeave` to call `maybeAdvance()` after removing the departing player from `this.state.players`, so a remaining all-ready set of connected players can advance once a non-ready player disconnects.

## 5. Server: Tests

- [x] 5.1 Update `games/road-to-survival/server/src/rooms/GameRoom.integration.test.ts`: remove/replace assertions about the `"move"` message with coverage for `"ready"` (single player, multiple players, partial readiness) against a real Testcontainers-provisioned Postgres per the existing integration test setup. (No prior test referenced `"move"`; added the `"ready"` coverage.)
- [x] 5.2 Add an integration test for full week progression at the default `daysPerWeek = 5`: readying up through segments 1-9 advances one at a time; reaching all-ready at segment 10 sets `phase = "week-end"` without exceeding segment 10.
- [x] 5.3 Add an integration test for a room created with a custom `daysPerWeek` (e.g. 3): the week-end decision state is reached at segment 6, not segment 10.
- [x] 5.4 Add an integration test for `"resolve-week-end"`: admin sends `"continue"` → week increments, segment resets to 1, phase returns to `"active"`, `daysPerWeek` is unchanged; non-admin attempting to resolve is rejected and phase stays `"week-end"`.
- [x] 5.5 Add an integration test for `"resolve-week-end"` with `outcome: "death"` → phase becomes `"game-over"`, and a subsequent `"ready"` message from a player is ignored (state does not change).
- [x] 5.6 Add an integration test for the disconnect scenario: with 2 of 3 players ready, the third disconnects, and the room advances using only the 2 remaining connected players' readiness.

## 6. Client: Timeline Board Scene

- [x] 6.1 In `games/road-to-survival/client/src/scenes/MainScene.ts` (or a new `TimelineScene.ts` swapped in via `main.ts`), remove the `pointerdown` → `"move"` handler and the per-player rectangle rendering tied to `x`/`y`.
- [x] 6.2 Render a horizontal timeline track of `timeline.daysPerWeek * 2` tiles using Phaser `Graphics`/`Rectangle` primitives with a Catan-inspired palette (warm tan/brown fills, dark chunky borders), subscribing to `$(this.room.state).timeline.onChange` to re-render (including rebuilding the tile count if `daysPerWeek` differs from the last render).
- [x] 6.3 Visually distinguish completed, current, and upcoming tiles (e.g. muted fill for completed, highlighted/bordered fill for current, dimmed for upcoming), per the Timeline Board Presentation requirement.
- [x] 6.4 Give each tile an alternating day/night base styling (e.g. lighter warm tones for day segments, darker cooler tones for night segments) derived from the segment→day/time-of-day mapping (task 3.4), independent of and layered under the completed/current/upcoming treatment from 6.3.
- [x] 6.5 Render the current week number and the current day/time-of-day label (using the segment→day/time-of-day mapping from task 3.4), always visible on screen.
- [x] 6.6 Add a "Ready" button/control that sends the `"ready"` message and reflects the local player's own ready state; render other players' ready state (e.g. a marker per connected player) via `$(player).onChange`. (Implemented in the new Preact `gameHud.tsx` overlay alongside 7.1-7.3, per design.md's decision to reuse the `roomGate.tsx` pattern for interactive controls, rather than as Phaser game objects.)

## 7. Client: Week-End Decision UI

- [x] 7.1 Add a week-end decision overlay (following the existing Preact `roomGate.tsx` pattern) shown to all players when `timeline.phase === "week-end"`.
- [x] 7.2 For the admin player only, show "Continue to next week" and "Party dies" buttons in the overlay that send `"resolve-week-end"` with the corresponding `outcome`; non-admin players see a waiting message instead of the buttons.
- [x] 7.3 Add a game-over view shown when `timeline.phase === "game-over"` that replaces the board and disables the ready control.

## 8. Client: Tests

- [x] 8.1 Add/update unit tests covering the segment→day/time-of-day mapping helper (task 3.4) for both the default `daysPerWeek = 5` and a custom value, if implemented client-side, or its consumption if server-provided. (Implemented client-side in `client/src/scenes/timeline.ts`, mirroring the server helper.)
- [x] 8.2 Add unit tests for the week-end decision overlay: admin sees resolve buttons and non-admin does not; buttons send the expected `"resolve-week-end"` payload.
- [x] 8.3 Update `games/road-to-survival/client/src/net/room.test.ts` if it references the removed `"move"` message. (No reference found; no changes needed.)

## 9. End-to-End Tests

- [x] 9.1 Update `games/road-to-survival/e2e/tests` to remove/replace any scenario relying on click-to-move. (Updated `create-and-join.spec.ts` and `admin-rejoin.spec.ts`, which relied on canvas clicks and the resulting `x`/`y` sync; `helpers.ts`'s `observeRoom` now tracks `isAdmin`/`ready` instead of `x`/`y`.)
- [x] 9.2 Add an e2e test: two players in a room (default `daysPerWeek`) both click "Ready" and observe the timeline board advance to segment 2 for both clients.
- [x] 9.3 Add an e2e test: driving a room through all 10 segments (default `daysPerWeek = 5`), verifying the week-end overlay appears, the admin resolves with "continue", and the board resets to Week 2, Segment 1 for all connected clients.

## 10. Documentation

- [x] 10.1 Update `games/road-to-survival/README.md`'s gameplay description to replace "Click anywhere on the game canvas to move your square" with a description of the ready-up timeline flow, including that the admin can set the room's days-per-week at creation (default 5).
