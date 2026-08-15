## Purpose

Gives every player in a room a shared, visible sense of in-game time as a Catan-styled board track, and defines how the party advances through days and weeks together, including the forced continue-or-death decision at each week's end.

## Requirements

### Requirement: Room Admin Configures Week Length
When creating a room, the system SHALL allow the admin to specify the number of days in a week for that room's timeline. If no value is supplied, or the supplied value is not a positive whole number, the system SHALL default to 5 days. The configured value SHALL remain fixed for the lifetime of the room.

#### Scenario: Room created without a days-per-week value
- **WHEN** an admin creates a room without specifying a days-per-week value
- **THEN** the room's timeline uses a default of 5 days per week

#### Scenario: Room created with a custom days-per-week value
- **WHEN** an admin creates a room specifying 3 as the days-per-week value
- **THEN** the room's timeline uses 3 days per week for the lifetime of that room

#### Scenario: Invalid days-per-week value falls back to default
- **WHEN** an admin creates a room specifying a days-per-week value that is zero, negative, or not a whole number
- **THEN** the room's timeline uses the default of 5 days per week

### Requirement: Timeline Segment Structure
The system SHALL divide each in-game week into the room's configured number of days (5 by default, see Room Admin Configures Week Length), and each day into 2 segments of 12 in-game hours each, for a total of (days x 2) segments per week. Segments SHALL be numbered 1 through the week's total segment count and SHALL each be identifiable by their day number and time-of-day (day/night).

#### Scenario: Segment identifies day and time-of-day
- **WHEN** a room using the default 5-day week has its timeline at segment 3
- **THEN** the system reports this as Day 2, Day-time (the first segment of Day 2)

#### Scenario: Last segment of a custom-length week
- **WHEN** a room is configured with 3 days per week and its timeline is at segment 6
- **THEN** the system reports this as Day 3, Night-time, the final segment before the week ends

### Requirement: Shared Room Timeline
Each room SHALL maintain exactly one timeline, shared by all players in that room. The timeline's current week number, current segment (1 through the room's total segment count), and derived day/time-of-day SHALL be visible to every connected player in real time.

#### Scenario: New room starts at Week 1, Segment 1
- **WHEN** a room is created
- **THEN** its timeline starts at Week 1, Segment 1 (Day 1, Day-time)

#### Scenario: Timeline state is consistent across players
- **WHEN** two players are connected to the same room
- **THEN** both players observe the same week number and segment at all times

### Requirement: Per-Segment Ready-Up
For the current segment, the system SHALL allow each connected player to mark themselves ready. A player's readiness SHALL be visible to all players in the room.

#### Scenario: Player marks ready
- **WHEN** a connected player sends a ready signal for the current segment
- **THEN** the system records that player as ready for the current segment
- **AND** all connected players observe the updated readiness

#### Scenario: Player joins mid-segment as not ready
- **WHEN** a new player joins a room whose timeline is mid-segment
- **THEN** the joining player is recorded as not ready for the current segment

### Requirement: Segment Advances When All Players Are Ready
When every currently connected player in a room has marked themselves ready for the current segment, and the current segment is not the last segment of the week (i.e., the room's total segment count has not been reached), the system SHALL advance the timeline to the next segment and reset every player's readiness to not-ready for the new segment.

#### Scenario: All ready triggers advancement
- **WHEN** every connected player in a room is marked ready for the current segment, and that segment is before the week's last segment
- **THEN** the system advances the timeline to the next segment
- **AND** all players' readiness is reset to not-ready

#### Scenario: Advancement waits for all players
- **WHEN** at least one connected player has not marked ready for the current segment
- **THEN** the system does not advance the timeline

#### Scenario: Disconnected players do not block advancement
- **WHEN** a player disconnects from the room while other players are waiting on them to ready up
- **THEN** the system evaluates readiness only against currently connected players
- **AND** advancement can proceed once all remaining connected players are ready

### Requirement: Week-End Decision Point
When every connected player is ready during the last segment of a week, the system SHALL NOT automatically advance the timeline. Instead it SHALL enter a week-end decision state, visible to all players, in which no further ready-up or advancement is possible until the decision is resolved.

#### Scenario: Reaching end of week triggers decision state instead of advancing
- **WHEN** every connected player is marked ready during the last segment of a week
- **THEN** the system enters a week-end decision state for that room
- **AND** the timeline does not advance past the week's last segment on its own

#### Scenario: Ready-up is disabled during the decision state
- **WHEN** a room is in the week-end decision state
- **THEN** the system does not accept further ready signals from players

### Requirement: Admin Resolves Week-End Decision
While a room is in the week-end decision state, the system SHALL allow only that room's admin to resolve it by choosing either "continue to next week" or "party dies". This decision SHALL be a manual placeholder choice; deriving it automatically from survival or resource conditions is out of scope for this capability.

#### Scenario: Admin continues to next week
- **WHEN** the room's admin resolves the week-end decision with "continue to next week"
- **THEN** the system increments the week number, resets the timeline to segment 1 of the new week, and resets all players' readiness to not-ready
- **AND** the room exits the week-end decision state

#### Scenario: Admin ends the game with party death
- **WHEN** the room's admin resolves the week-end decision with "party dies"
- **THEN** the system transitions the room to a terminal game-over state

#### Scenario: Non-admin cannot resolve the decision
- **WHEN** a non-admin player attempts to resolve the week-end decision
- **THEN** the system rejects the attempt and the room remains in the week-end decision state

### Requirement: Game-Over State Is Terminal
Once a room enters the game-over state, the system SHALL NOT accept further ready signals, segment advancement, or week-end decisions for that room.

#### Scenario: No further actions after game over
- **WHEN** a room is in the game-over state
- **THEN** the system rejects ready signals and any week-end decision attempts for that room

### Requirement: Timeline Board Presentation
The client SHALL render the shared timeline as a segmented board track in the game's tabletop-inspired visual style, visually distinguishing completed segments, the current segment, and upcoming segments within the week, and displaying the current week number at all times. Segment tiles SHALL alternate between a day styling and a night styling in sequence, matching each segment's actual day/night time-of-day.

#### Scenario: Current segment is visually distinct
- **WHEN** a player views the timeline board
- **THEN** the currently active segment is visually distinguishable from completed and upcoming segments

#### Scenario: Week number always visible
- **WHEN** a player views the timeline board at any point in the game
- **THEN** the current week number is displayed

#### Scenario: Day and night segments alternate visually
- **WHEN** a player views the timeline board
- **THEN** each day-time segment tile is styled distinctly from each night-time segment tile, and this styling alternates tile-by-tile across the week in lockstep with each tile's actual time-of-day
