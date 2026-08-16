## 1. Data model

- [x] 1.1 Add `RoomSegmentCard` and `RoomSegmentVote` models to `server/prisma/schema.prisma` per design.md's Decisions (including the `@@unique([roomId, week, segment])` and `@@unique([cardId, roomPlayerId])` constraints and the `RoomPlayer.votes` back-relation), and generate the Prisma migration.
- [x] 1.2 Add `server/src/db/segmentCards.ts` with data-access functions: create cards for a room/week (skip-on-conflict for idempotency), load a room's current-week cards with their votes, and upsert a vote by `(cardId, roomPlayerId)`.
- [x] 1.3 Integration test (Testcontainers Postgres) covering: creating a week's cards, idempotent re-creation being a no-op, loading cards with votes, and upserting/replacing a vote.

## 2. Card generation logic

- [x] 2.1 Add the D&D 5e 18-skill pool as a shared constant (server-side), per design.md's Non-Goals list.
- [x] 2.2 Implement a pure card-generation function: samples 4 distinct skills, rolls each option's DC per its tier (one unconstrained 5–20, one 10–15, two independent 15–20), and returns the 4 options in shuffled display order.
- [x] 2.3 Unit tests: generated card always has 4 distinct skills; DC tier bounds are respected across many runs; option order is not tier-ordered (position doesn't correlate with tier) across many runs.

## 3. Server room integration

- [x] 3.1 Extend `GameState`/`TimelineState` (`server/src/rooms/schema/GameState.ts`) with a `MapSchema<SegmentCardState>` keyed by segment number, each holding 4 `SegmentCardOptionState` entries (`skill`, `dc`, `voters: ArraySchema<string>`).
- [x] 3.2 In `GameRoom.onCreate`'s "create" branch, generate and persist Week 1's cards, then populate the schema map.
- [x] 3.3 In the `resolve-week-end` "continue" branch, generate and persist the new week's cards, then repopulate the schema map (replacing the prior week's entries).
- [x] 3.4 In `GameRoom.onCreate`'s "join" branch (room process recreated for an existing room), load the current week's persisted cards and votes from Postgres into the schema map instead of generating; self-heal by generating only for any segment of the current week missing a card row.
- [x] 3.5 Add a `vote-skill-check` message handler: accepts only an option index, applies it to `this.state.timeline.segment`, rejects when `timeline.phase !== "active"`, upserts the vote via `segmentCards.ts`, and updates the option's `voters` list in schema state (removing the player's username from any other option on the same card first).
- [x] 3.6 Tests for the message handler covering: first vote recorded, changing a vote moves it, vote rejected outside the active phase, vote always applies to the room's actual current segment. (Written as `GameRoom.integration.test.ts` cases against real Postgres + a real Colyseus test server, matching this file's existing convention for every other message handler, since the handler writes through Prisma and the project's Postgres-touching-code rule requires that coverage rather than a database-mocked unit test.)

## 4. Client icons

- [x] 4.1 Source an SVG icon for each of the 18 D&D 5e skills from an openly-licensed set (game-icons.net, CC BY 3.0), save under `client/public/theme/icons/skills/<skill-slug>.svg` following the existing `theme/icons/` convention (background stripped, foreground recolored to black for Phaser's `setTintFill`, matching `sun.svg`/`moon.svg`). Recorded attribution using the project's actual existing mechanism (`ATTRIBUTIONS.md` + the in-game Credits panel's `ATTRIBUTED_ASSETS` list in `credits.tsx`) rather than a new standalone attribution file, since that's the established convention this project already uses for the Sun/Moon icons.

## 5. Client UI

- [x] 5.1 Add a content card component rendered in the segment content area (alongside the existing day/time-of-day display), showing the 4 options with their skill icon and DC, sourced from the shared room state for the currently selected segment. (Rendered as Phaser GameObjects inside `MainScene.ts`, matching how the day/time-of-day text and nav bar are already built, rather than a separate DOM/Preact component -- this game's content area is entirely canvas-rendered, with state mirrored to `data-*` attributes for e2e testability, and the HUD's Preact components are a visually distinct overlay outside that canvas area.)
- [x] 5.2 Wire per-option voting: clicking/selecting an option for the room's actual current segment sends `vote-skill-check`; the control is not interactive for a non-current selected segment (matches non-admin's existing restriction and the admin's nav-bar preview case).
- [x] 5.3 Render a voted-player label next to an option's icon for each username in that option's `voters` list, updating live as room state changes.
- [x] 5.4 Tests for the card's logic: `skillCheckCard.test.ts` unit-tests the pure helpers (skill labels/icon keys, voter-list formatting including a vote moving between two option's lists, and the current-segment/active-phase votability gate) -- matching this codebase's existing split where pure logic used by MainScene.ts gets direct unit tests (e.g. `timeline.test.ts`) and the actual interactive/visual Phaser rendering is covered by Playwright e2e tests (see 6.1), since Phaser scenes have no unit-testable "component" to render in isolation the way the Preact HUD does.

## 6. End-to-end coverage

- [x] 6.1 Playwright test: two connected players see the same generated card for the current segment, one casts a vote, and the other player's view updates with the voter label in real time. (Added a second test alongside it confirming a card's contents are stable across a re-render.)
