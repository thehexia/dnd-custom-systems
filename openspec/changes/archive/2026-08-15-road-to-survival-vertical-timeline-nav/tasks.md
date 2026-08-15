## 1. Vertical Nav Bar Layout

- [x] 1.1 Replace horizontal track layout constants in `MainScene.ts` (`TRACK_LEFT`, `TRACK_TOP`, `TILE_HEIGHT`, `TILE_GAP`) with vertical nav-bar constants docked to the right edge (nav bar width, right margin, top margin, computed per-tile height with the existing `Math.max(20, ...)` floor)
- [x] 1.2 Rewrite `renderTimeline()`'s tile loop to stack tiles top-to-bottom instead of left-to-right, reusing the existing completed/current/upcoming alpha and day/night fill logic
- [x] 1.3 Add a `SELECTED_BORDER` color constant and draw it on the selected segment's tile when the selected segment differs from the room's actual current segment (per design.md - Decisions)
- [x] 1.4 Reposition the week number text within the nav bar area (e.g. above the tile stack)

## 2. Segment Selection State

- [x] 2.1 Add `selectedSegment: number | null` and `lastKnownCurrentSegment: number | null` scene-local state to `MainScene`
- [x] 2.2 Implement the auto-follow update in `renderTimeline()`: when `selectedSegment` is `null` or equals the previous `lastKnownCurrentSegment`, advance it to the new current segment; always update `lastKnownCurrentSegment` afterward
- [x] 2.3 Implement a `selectSegment(segment: number)` method that sets `selectedSegment` and triggers a re-render of the nav bar styling and content area, without sending anything to the room
- [x] 2.4 Test: selecting a segment via `selectSegment` does not call `room.send` and leaves `room.state.timeline` untouched — verified via e2e (see 6.2): clicking a tile leaves the observer-room's `state.timeline.segment` unchanged. `MainScene.ts` is excluded from unit coverage project-wide (jsdom has no canvas/WebGL, see `vitest.config.ts`), so this couldn't be a unit test as originally scoped; the underlying selection-decision logic it's built on (`nextSelectedSegment`) is unit tested directly in `timeline.test.ts`.
- [x] 2.5 Unit test: when the player has not deviated from the current segment, advancing `room.state.timeline.segment` also advances `selectedSegment` — implemented as a `nextSelectedSegment` unit test in `timeline.test.ts` (pure logic extracted out of `MainScene` for testability, same reasoning as 2.4).
- [x] 2.6 Unit test: when the player has selected a non-current segment, advancing `room.state.timeline.segment` does not change `selectedSegment` — same as 2.5.

## 3. Tile Interactivity

- [x] 3.1 In `create()`, allocate one interactive `Phaser.GameObjects.Zone` per segment (count derived from `daysPerWeek * 2` once `room.state.timeline` is ready), sized and positioned from the same per-tile layout values used for drawing, wired to call `selectSegment(i)` on `pointerdown`
- [x] 3.2 Ensure zones are created once (not recreated on every `renderTimeline()` call) per design.md's "tile objects are created once" decision
- [x] 3.3 Test: clicking (simulating `pointerdown` on) a segment's zone updates `selectedSegment` to that segment's number — verified via e2e (see 6.2), same testability constraint as 2.4. Playwright clicks the real canvas at the nav bar's known pixel coordinates (canvas is a fixed, unscaled 800x600) and reads the result off a `data-selected-segment` attribute mirrored onto `#app` for observability, since canvas text has no DOM representation to assert against directly.

## 4. Jump to Current Day Control

- [x] 4.1 Add an interactive "Jump to current day" control (Text or Rectangle+Text) to the nav bar, calling `selectSegment(timeline.segment)` on activation
- [x] 4.2 Test: activating the control when `selectedSegment` differs from the current segment sets `selectedSegment` to the current segment — verified via e2e (see 6.2), same testability constraint as 2.4/3.3.

## 5. Segment Content Area

- [x] 5.1 Reposition/repurpose the existing day/time-of-day `Text` object(s) into a content area occupying the board space left of the nav bar
- [x] 5.2 Drive the content area's displayed day/time-of-day from `describeSegment(selectedSegment)` instead of `describeSegment(room.state.timeline.segment)` directly
- [x] 5.3 Test: the content area's displayed text reflects `selectedSegment`, not the room's current segment, when the two differ — verified via e2e (see 6.2) using a `data-segment-label` attribute mirroring the content area's text, same testability constraint as 2.4.

## 6. Test Suite Updates

- [x] 6.1 Update `client/src/scenes/*.test.ts` coverage for the vertical layout: added unit tests in `timeline.test.ts` for `tileVisualState` (completed/current/selected/upcoming classification, day/night time-of-day) and `computeVerticalTileLayout` (top-to-bottom stacking, minimum tile height floor). The actual Phaser draw calls in `MainScene.ts` that consume these stay outside unit coverage per the project's existing exclusion.
- [x] 6.2 Update `e2e/tests/timeline-board.spec.ts`: added a test asserting `Day 1, Day-time` is shown on initial load (content area's minimum placeholder requirement), a test that clicking a nav bar tile changes the selection without affecting the room's live segment and that the jump-to-current-day control returns to it, and a test that clicking a different tile updates the selection — using real canvas pixel clicks at the nav bar's known coordinates and the `data-selected-segment`/`data-segment-label` attributes added to `MainScene.ts` for observability. Full e2e suite run (`npx playwright test`, real Postgres via Testcontainers): 7/7 passed.

## 7. Manual Verification

- [x] 7.1 Ran the client dev server, joined a room, and visually confirmed via screenshots and DOM-mirrored state: vertical nav bar on the right, content area filling the rest of the board, current segment highlighted (amber), selecting a different segment shows a distinct highlight (blue) alongside the current one, the jump-to-current-day control returns to the live segment, and the content area updates to match the selection throughout
