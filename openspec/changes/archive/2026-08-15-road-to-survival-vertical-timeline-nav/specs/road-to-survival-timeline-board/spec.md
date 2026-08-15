## MODIFIED Requirements

### Requirement: Timeline Board Presentation
The client SHALL render the shared timeline as a vertical nav bar docked to one side of the game board, in the game's tabletop-inspired visual style, visually distinguishing completed segments, the room's actual current segment, and upcoming segments within the week, and displaying the current week number at all times. Segment tiles SHALL be stacked top-to-bottom in segment order and SHALL alternate between a day styling and a night styling in sequence, matching each segment's actual day/night time-of-day. The area of the game board not occupied by the nav bar SHALL be reserved for segment content (see Segment Content Area).

#### Scenario: Current segment is visually distinct
- **WHEN** a player views the timeline nav bar
- **THEN** the room's actual current segment is visually distinguishable from completed and upcoming segments

#### Scenario: Week number always visible
- **WHEN** a player views the timeline nav bar at any point in the game
- **THEN** the current week number is displayed

#### Scenario: Day and night segments alternate visually
- **WHEN** a player views the timeline nav bar
- **THEN** each day-time segment tile is styled distinctly from each night-time segment tile, and this styling alternates tile-by-tile down the nav bar in lockstep with each tile's actual time-of-day

#### Scenario: Nav bar tiles are stacked vertically
- **WHEN** a player views the timeline nav bar
- **THEN** segment tiles are arranged in a single vertical column, ordered from segment 1 at one end to the week's last segment at the other

## ADDED Requirements

### Requirement: Segment Selection via Nav Bar
The client SHALL allow a player to select any segment of the current week by interacting with its tile in the nav bar. The selected segment SHALL determine what is displayed in the segment content area (see Segment Content Area) and is independent of the room's actual current segment: a player MAY select and view a segment other than the room's current segment without affecting the shared room timeline.

#### Scenario: Player selects a different segment to view
- **WHEN** a player interacts with a nav bar tile for a segment other than the currently selected one
- **THEN** that segment becomes the selected segment
- **AND** the segment content area updates to display that segment's content

#### Scenario: Selecting a segment does not change room state
- **WHEN** a player selects a segment via the nav bar
- **THEN** the room's actual current segment, week, and phase are unaffected

### Requirement: Selected Segment Defaults to Current Segment
When a player first views the timeline, and whenever the room's actual current segment advances, the client SHALL set the selected segment to the room's actual current segment, unless the player has manually selected a different segment that the advancement has not superseded.

#### Scenario: Selected segment matches current segment on load
- **WHEN** a player views the timeline board for the first time in a session
- **THEN** the selected segment is the room's actual current segment

#### Scenario: Room advances while viewing the current segment
- **WHEN** the room's actual current segment advances while the player's selected segment was the previous current segment
- **THEN** the client updates the selected segment to the new current segment

### Requirement: Current-vs-Selected Segment Distinction
When the selected segment differs from the room's actual current segment, the nav bar SHALL visually distinguish the two, so a player can tell which segment they are viewing apart from which segment is live.

#### Scenario: Viewing a non-current segment
- **WHEN** a player has selected a segment that is not the room's actual current segment
- **THEN** the nav bar visually marks both the selected segment's tile and the room's actual current segment's tile, distinguishably from each other and from other tiles

#### Scenario: Selected segment is the current segment
- **WHEN** the player's selected segment is the room's actual current segment
- **THEN** the nav bar shows a single distinguishing mark for that tile rather than two separate marks

### Requirement: Jump to Current Day Control
The nav bar SHALL provide a control that, when activated, sets the selected segment to the room's actual current segment.

#### Scenario: Player jumps back to the current day
- **WHEN** a player has selected a segment other than the room's actual current segment and activates the jump-to-current-day control
- **THEN** the selected segment becomes the room's actual current segment
- **AND** the segment content area updates accordingly

### Requirement: Segment Content Area
The client SHALL render a content area occupying the portion of the game board not covered by the nav bar. The content area SHALL display, at minimum, the day number and time-of-day (day-time or night-time) of the selected segment.

#### Scenario: Content area shows selected segment's day
- **WHEN** a player views the game board with a segment selected
- **THEN** the content area displays the day number and time-of-day of the selected segment

#### Scenario: Content area updates when selection changes
- **WHEN** the selected segment changes, whether by player interaction or by following the room's current segment
- **THEN** the content area updates to reflect the newly selected segment's day number and time-of-day
