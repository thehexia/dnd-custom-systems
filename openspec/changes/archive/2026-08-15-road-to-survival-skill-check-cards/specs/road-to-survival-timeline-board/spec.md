## MODIFIED Requirements

### Requirement: Segment Content Area
The client SHALL render a content area occupying the portion of the game board not covered by the nav bar. The content area SHALL display, at minimum, the day number and time-of-day (day-time or night-time) of the selected segment, and SHALL render the selected segment's skill-check content card (see the `road-to-survival-skill-check-cards` capability for the card's contents and voting behavior).

#### Scenario: Content area shows selected segment's day
- **WHEN** a player views the game board with a segment selected
- **THEN** the content area displays the day number and time-of-day of the selected segment

#### Scenario: Content area updates when selection changes
- **WHEN** the selected segment changes, whether by player interaction or by following the room's current segment
- **THEN** the content area updates to reflect the newly selected segment's day number, time-of-day, and skill-check content card

#### Scenario: Content area shows the selected segment's content card
- **WHEN** a player views the game board with a segment selected
- **THEN** the content area displays that segment's skill-check content card alongside its day number and time-of-day
