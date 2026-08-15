## Why

The current timeline board renders as a single horizontal strip of tiles across the top of the canvas, with the week/day text stacked above it. As the party's week grows (more days per week, or future per-segment content), a horizontal strip runs out of width and leaves most of the board unused. Restructuring the board around a vertical timeline frees up the majority of the play area for actual per-segment content (currently just a placeholder) while keeping fast, at-a-glance navigation between segments.

## What Changes

- **BREAKING**: The timeline board layout changes from a horizontal strip at the top of the canvas to a vertical nav bar docked to the right edge of the canvas, with the remaining board area (left of the nav bar) reserved for segment content.
- The vertical nav bar renders one tile per segment of the current week (stacked top-to-bottom instead of left-to-right), preserving the existing completed/current/upcoming visual states and day/night tile styling.
- Each nav bar tile is clickable (Phaser interactive game object) and selects that segment for viewing in the content area; the currently selected segment does not have to be the room's live current segment.
- The nav bar visually distinguishes the room's actual current segment (live game state) from the segment currently selected for viewing, when they differ.
- The nav bar includes a "Jump to current day" control that, when activated, selects the room's actual current segment.
- The content area (board area left of the nav bar) renders placeholder content for the selected segment, showing at minimum the day number and time-of-day (e.g. "Day 2, Day-time") of the selected segment.
- On load and whenever the room's live segment advances, the selected segment defaults to / follows the room's current segment, until the player manually selects a different segment via the nav bar.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `road-to-survival-timeline-board`: The "Timeline Board Presentation" requirement changes from describing a horizontal segmented track to describing a vertical nav bar docked to one side of the board, plus a new requirement set covering segment selection/navigation (click-to-select, current-vs-selected distinction, jump-to-current-day) and a new requirement for the placeholder segment content area.

## Impact

- `games/road-to-survival/client/src/scenes/MainScene.ts`: timeline board rendering rewritten from a horizontal `Graphics`-drawn track to a vertical nav bar plus content area; adds interactive game objects for tile clicks and the jump-to-current-day control; adds local "selected segment" state independent of room state.
- `games/road-to-survival/client/src/scenes/timeline.ts`: unaffected in its segment/day math (`describeSegment`, `totalSegments`); may gain a small helper for locating a segment's nav bar tile position if useful.
- `games/road-to-survival/client/src/scenes/*.test.ts`: unit tests updated/added for the new layout and selection behavior.
- `e2e/tests/timeline-board.spec.ts`: updated to assert against the new vertical layout and segment-selection interactions (still via canvas/room-state polling, since the board remains Phaser-rendered).
- No server-side or schema changes: `TimelineState` (week, segment, daysPerWeek, phase) is unchanged; this is a client presentation-only change.
