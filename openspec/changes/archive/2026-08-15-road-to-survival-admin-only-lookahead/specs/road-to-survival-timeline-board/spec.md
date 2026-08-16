## MODIFIED Requirements

### Requirement: Segment Selection via Nav Bar
The client SHALL allow only the room's admin to select any segment of the current week by interacting with its tile in the nav bar. The selected segment SHALL determine what is displayed in the segment content area (see Segment Content Area) and is independent of the room's actual current segment: the admin MAY select and view a segment other than the room's current segment without affecting the shared room timeline. For a non-admin player, the client SHALL NOT allow segment selection via the nav bar; a non-admin player's selected segment SHALL always be the room's actual current segment, so their content area only ever shows the current segment's content card.

#### Scenario: Player selects a different segment to view
- **WHEN** the room's admin interacts with a nav bar tile for a segment other than the currently selected one
- **THEN** that segment becomes the selected segment
- **AND** the segment content area updates to display that segment's content

#### Scenario: Selecting a segment does not change room state
- **WHEN** the admin selects a segment via the nav bar
- **THEN** the room's actual current segment, week, and phase are unaffected

#### Scenario: Non-admin cannot select a different segment
- **WHEN** a non-admin player interacts with a nav bar tile for a segment other than the room's actual current segment
- **THEN** the selected segment remains the room's actual current segment
- **AND** the segment content area continues to display only the current segment's content

### Requirement: Jump to Current Day Control
The nav bar SHALL provide a control, available only to the room's admin, that when activated sets the selected segment to the room's actual current segment. The client SHALL NOT present this control as an interactive affordance to non-admin players, since a non-admin player's selected segment always already matches the room's actual current segment.

#### Scenario: Player jumps back to the current day
- **WHEN** the admin has selected a segment other than the room's actual current segment and activates the jump-to-current-day control
- **THEN** the selected segment becomes the room's actual current segment
- **AND** the segment content area updates accordingly

#### Scenario: Control is not available to non-admin players
- **WHEN** a non-admin player views the nav bar
- **THEN** the jump-to-current-day control is not presented as an interactive affordance to them
