## Context

The timeline board lives entirely inside the Phaser `MainScene` (`games/road-to-survival/client/src/scenes/MainScene.ts`), drawn imperatively onto a `Graphics` object against a fixed 800x600 canvas. There is no DOM/CSS involved in the board itself (the Preact `GameHud` overlay is a separate, absolutely-positioned DOM element and is out of scope here). `renderTimeline()` currently re-derives all tile positions and styles from `room.state.timeline` on every state change and does not track any client-only UI state — the board has no concept of a "selected" segment distinct from the room's live segment today. Segment/day math (`describeSegment`, `totalSegments`) already lives in `games/road-to-survival/client/src/scenes/timeline.ts` and is reused as-is (see proposal.md - Impact). The user has confirmed this feature stays entirely inside the Phaser canvas rather than becoming a DOM/Preact overlay (see proposal.md - Why), so nav bar interactivity and the content area both need to be built with Phaser game objects, not HTML.

## Goals / Non-Goals

**Goals:**
- Replace the horizontal `Graphics`-drawn track with a vertical nav bar docked to the right edge of the canvas, reusing the existing completed/current/upcoming and day/night tile styling logic.
- Make nav bar tiles clickable so a player can select any segment of the current week for viewing, independent of the room's live current segment.
- Track "selected segment" as new client-only state in `MainScene`, separate from `room.state.timeline`, including the auto-follow behavior described in the specs.
- Render a placeholder content area (day number + time-of-day) in the board space left of the nav bar.

**Non-Goals:**
- Real segment content (encounters, events, resources, etc.) — still a placeholder that shows only the day/time-of-day.
- Scrolling, virtualization, or pagination of the nav bar for very large `daysPerWeek` values — tiles shrink to fit the available canvas height, same limitation the horizontal track already had for tile width.
- Any change to server state, the `TimelineState` schema, or the segment-advancement/week-end/game-over logic — this is a client rendering and local-UI-state change only.
- Moving the board off the Phaser canvas onto DOM/Preact (explicitly ruled out for this change).

## Decisions

**Vertical layout constants replace horizontal ones.** `TRACK_LEFT/TRACK_TOP/TILE_HEIGHT` become nav-bar constants anchored to the right edge (`NAV_RIGHT_MARGIN`, `NAV_TOP`, `TILE_WIDTH`, computed `tileHeight`), mirroring the existing pattern where `tileWidth` was computed from available horizontal space (`MainScene.ts:72-73`). The content area's usable width is simply `scale.width` minus the nav bar's width and margins — no new layout system is introduced, just swapped axes.

**Per-tile hit-testing uses an interactive `Zone` overlay, not `Graphics`.** `Graphics` objects don't support per-shape input, and rebuilding the whole nav bar's interactivity from scratch (e.g. switching every tile to `Rectangle` game objects) would lose the existing rounded-rect styling code almost verbatim reusable from the horizontal track. Instead, keep `Graphics` for all visual fill/stroke (day/night/completed/current/selected styling), and layer one invisible `Phaser.GameObjects.Zone` per segment on top, sized to that tile's bounds, with `setInteractive()` + a `pointerdown` handler that calls `selectSegment(i)`. Alternative considered: convert tiles to `Rectangle` game objects (interactive natively) — rejected because `Rectangle` has no rounded-corner support, which would visibly regress the existing tabletop styling.

**Tile objects are created once, not rebuilt every render.** `daysPerWeek` — and therefore total segment count — is fixed for the lifetime of a room (see `road-to-survival-timeline-board` spec, "Room Admin Configures Week Length"), so the zones and their positions never need to change shape, only their visual state. `create()` allocates one `Zone` per segment (count from `room.state.timeline.daysPerWeek * 2` once available) and stores them in an array keyed by segment number; `renderTimeline()` only restyles the `Graphics` fill/stroke per call, same as today. This avoids leaking/recreating input-enabled objects on every state change.

**Selected segment is scene-local state, tracked alongside the previous current segment.** Add `private selectedSegment: number | null = null` and `private lastKnownCurrentSegment: number | null = null` to `MainScene`. On every `renderTimeline()` call: if `selectedSegment === null` or `selectedSegment === lastKnownCurrentSegment` (i.e. the player was following the live segment, not deliberately viewing something else), set `selectedSegment` to the new `timeline.segment`; then update `lastKnownCurrentSegment = timeline.segment`. A tile click sets `selectedSegment` directly and leaves room state untouched, satisfying "Selecting a segment does not change room state." The jump-to-current-day control just calls the same `selectSegment(timeline.segment)` path a tile click would.

**Current vs. selected are drawn as two independently-colored borders.** Reuse `CURRENT_BORDER` for the room's actual current segment's tile; add a `SELECTED_BORDER` color for the selected segment's tile when it differs from the current one. When selected === current, draw only the current-segment border (existing single-border look is preserved for the common case).

**Content area is plain Phaser `Text`, positioned from `describeSegment(selectedSegment)`.** No new dependency; reuses the existing helper. `weekText`/`dayText` objects are repurposed/renamed to live in the content area rather than above the old horizontal track, and their content is driven by `selectedSegment` instead of `room.state.timeline.segment` directly (falling back to the room's segment before a player has interacted, per the default-follow requirement).

## Risks / Trade-offs

- **Very short tiles on rooms with a large `daysPerWeek`.** Vertical space (canvas height minus margins) is more constrained than the horizontal track's available width was. → Mitigation: apply the same minimum-tile-size floor the horizontal track used (`Math.max(20, ...)`), accepting that extremely long weeks will produce a visually dense nav bar; revisit with scrolling/pagination in a future change if this becomes a real scenario (rooms today default to 5 days/week = 10 segments).
- **Zone-based hit areas can drift from their visual tiles if layout constants change independently in the future.** → Mitigation: derive both the `Graphics` draw position and the `Zone` bounds from the same computed per-tile position/size values inside a single loop, rather than duplicating the math in two places.
- **Losing the "selected segment" on scene reload/reconnect.** Since it's scene-local and not persisted, a reconnect resets it to null, which correctly re-triggers the default-follow behavior — this is intended, not a gap.

## Migration Plan

Purely a client rendering change with no server or schema changes, so this ships as a normal client release; no data migration or feature flag is needed. Rollback is a plain revert of the client commit(s). Existing unit tests in `client/src/scenes/*.test.ts` and the e2e spec `e2e/tests/timeline-board.spec.ts` are updated as part of this change (see proposal.md - Impact) so a broken layout would fail CI before shipping.
