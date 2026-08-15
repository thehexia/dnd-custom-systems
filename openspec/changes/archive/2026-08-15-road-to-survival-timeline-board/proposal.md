## Why

Road to Survival is currently a bare prototype: players are colored squares you drag around a canvas, with no shared game structure. To become the survival board game it's meant to be, the party needs a shared sense of time passing and stakes attached to it. This change introduces the first real game-board mechanic: a Catan-styled timeline track that marks the party's progress through 12-hour segments, tracks which week the party is on, and forces a decision point at the end of each week (5 days by default, configurable by the room admin).

## What Changes

- Add a shared, room-wide timeline board: each day is split into 2 segments (12 hours each); a week is 5 days (10 segments) by default. Rendered as a Catan-esque board track (chunky wooden tiles, warm parchment palette, hand-crafted iconography) rather than the current bare canvas.
- Let the room admin optionally set the number of days per week when creating a room; if omitted, it defaults to 5 days, and the value is fixed for that room's lifetime once set.
- Track and display the current week number, day, and segment (e.g. "Week 2, Day 3, Night") to all players in the room.
- Replace free-form click-to-move with a per-segment "ready up" flow: each connected player marks themselves ready for the current segment; once every connected player is ready, the room server advances the timeline to the next segment and resets readiness for all players.
- At the end of the week's final segment (end of the last configured day's night — Day 5 by default), the timeline reaches a week-end decision point. This change stubs the outcome: the room admin is presented a manual choice (**Continue to next week** or **Party dies**) rather than deriving it from a survival/resource mechanic, which does not exist yet and is out of scope here.
- On "Continue to next week", reset to segment 1 of a new week and increment the week counter. On "Party dies", the room enters a terminal game-over state.
- **BREAKING**: Removes the existing click-anywhere-to-move interaction and the `x`/`y` position fields' role as the primary player affordance; player position is no longer the core interaction loop (fields may remain for future board-tile placement but movement-by-click is removed).

## Capabilities

### New Capabilities
- `road-to-survival-timeline-board`: Shared room timeline (week/day/segment tracking), per-segment ready-up advancement, end-of-week continue/death decision point, and the Catan-esque board rendering for these states.

### Modified Capabilities
(none — no existing capability specs cover player movement or game board state; this is greenfield for the game-mechanics side of road-to-survival)

## Impact

- **Server** (`games/road-to-survival/server/src/rooms/schema/GameState.ts`, `GameRoom.ts`): new schema fields for week/day/segment, configured days-per-week, and per-player ready state; an optional `daysPerWeek` room-creation setting (validated, defaulting to 5); new message handlers for "ready" and admin "resolve-week-end" actions; removal of the "move" handler.
- **Client** (`games/road-to-survival/client/src/scenes/MainScene.ts`, new UI/board rendering code, assets): replace the movable-square scene with a timeline board scene/UI showing segment progress, week counter, ready controls, and the week-end decision prompt for the admin; new Catan-esque visual assets (or styled primitives if no art assets are sourced yet).
- **Tests**: existing unit/integration/e2e coverage around the "move" message and player x/y sync needs updating or removal; new coverage for ready-up advancement, week rollover, and the week-end decision.
