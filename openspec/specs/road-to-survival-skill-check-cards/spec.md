## Purpose

Generates, persists, and displays each segment's "Road to Survival" content card: four randomly rolled D&D skill-check options with tiered DCs and skill icons, and the shared player voting mechanic on those options.

## Requirements

### Requirement: Card Generation Timing
When a week is generated — at room creation for that room's first week, and whenever the room's admin resolves the week-end decision with "continue to next week" — the system SHALL generate one skill-check content card for every segment of that week. Once generated, a segment's card contents SHALL NOT change for the remainder of the room's existence, including across the room's process being recreated (e.g. after a full dispose and later rejoin).

#### Scenario: Room creation generates Week 1 cards
- **WHEN** a room is created
- **THEN** the system generates a skill-check content card for every segment of Week 1

#### Scenario: Continuing to the next week generates its cards
- **WHEN** the room's admin resolves the week-end decision with "continue to next week"
- **THEN** the system generates a skill-check content card for every segment of the new week

#### Scenario: Revisiting a segment does not regenerate its card
- **WHEN** a player (or the admin, via the nav bar) views a segment whose card was already generated
- **THEN** the content area shows the same card contents as when it was first generated

#### Scenario: Card contents survive room recreation
- **WHEN** a room's live process fully disposes and is later recreated for the same room code
- **THEN** previously generated segments' card contents are loaded from storage rather than regenerated, and remain identical to what was originally generated

### Requirement: Card Presents Four Distinct Skill-Check Options
Each generated card SHALL contain exactly 4 options. Each option SHALL be assigned one of the D&D 5e skills, and no two options on the same card SHALL share the same skill.

#### Scenario: Card has four distinct skills
- **WHEN** a segment's card is generated
- **THEN** the card contains exactly 4 options, each assigned a different D&D 5e skill

### Requirement: Option DC Tiers
Each card's four options SHALL have their DC (Difficulty Class) assigned as follows:
- Exactly one option's DC SHALL be a value from 5 to 20 inclusive, with no further constraint.
- Exactly one option's DC SHALL be a value from 10 to 15 inclusive.
- The remaining two options' DCs SHALL each independently be a value from 15 to 20 inclusive.

#### Scenario: Unconstrained option can fall anywhere in range
- **WHEN** a segment's card is generated
- **THEN** exactly one of its four options has a DC between 5 and 20 inclusive, independent of the other options' DCs

#### Scenario: Mid-tier option is constrained
- **WHEN** a segment's card is generated
- **THEN** exactly one of its four options has a DC between 10 and 15 inclusive

#### Scenario: Two high-tier options are constrained
- **WHEN** a segment's card is generated
- **THEN** two of its four options each have a DC between 15 and 20 inclusive, rolled independently of one another

### Requirement: DC Visibility
Every option's DC SHALL be visibly displayed to any player viewing the card.

#### Scenario: DC shown alongside each option
- **WHEN** a player views a segment's content card
- **THEN** each of the four options displays its numeric DC

### Requirement: Skill Icon Display
Each option SHALL display an icon that visually represents its assigned skill.

#### Scenario: Every option shows its skill's icon
- **WHEN** a player views a segment's content card
- **THEN** each option displays the icon corresponding to its assigned skill, distinguishable from the other three options' icons

### Requirement: Voting Restricted to the Current Segment
The system SHALL only accept a vote for the segment matching the room's actual current segment at the time the vote is cast, and only while the room's timeline phase is "active". The system SHALL reject a vote attempt for any other segment or while the timeline is not in the "active" phase. The client SHALL NOT present voting as an interactive affordance on a card for a segment other than the room's actual current segment.

#### Scenario: Vote accepted for the current segment
- **WHEN** a connected player casts a vote for an option on the room's actual current segment's card
- **THEN** the system records the vote

#### Scenario: Vote rejected for a non-current segment
- **WHEN** the admin is previewing a segment other than the room's actual current segment via the nav bar and attempts to vote on that segment's card
- **THEN** the system rejects the attempt and no vote is recorded

#### Scenario: Vote rejected outside the active phase
- **WHEN** a player attempts to cast a vote while the room's timeline phase is "week-end" or "game-over"
- **THEN** the system rejects the attempt and no vote is recorded

### Requirement: One Active Vote Per Player Per Card
A connected player MAY cast a vote for one of a card's four options. Casting a vote for a different option on the same card SHALL replace that player's previous vote on that card. A player SHALL have at most one active vote per card at a time. A vote on one segment's card SHALL NOT affect, or be replaced by, voting on a different segment's card.

#### Scenario: First vote is recorded
- **WHEN** a player who has not yet voted on the current segment's card casts a vote for one of its options
- **THEN** that option is recorded as the player's vote for that card

#### Scenario: Changing a vote moves it
- **WHEN** a player who already voted for one option on the current segment's card casts a vote for a different option on the same card
- **THEN** the player's vote is recorded against the newly chosen option and removed from the previous option

#### Scenario: Votes are independent per segment
- **WHEN** a player has voted on one segment's card and later a different segment becomes the room's actual current segment
- **THEN** the player has no recorded vote on the new segment's card until they cast one

### Requirement: Voting Requires a Lead Token in Hunted Mode
While the room's mode is "hunted" (see the `road-to-survival-hunted-mode` capability), the system SHALL only accept a new skill-check vote, or a change of an existing vote to a different option, from a player who currently holds at least one Lead token. A player MAY hold more than one Lead token at a time. The system SHALL reject such an attempt from a player holding zero Lead tokens while the room is in "hunted" mode. This gate does NOT apply to retracting an existing vote (see Vote Retraction), which is always permitted regardless of Lead token count. This requirement does not apply while the room's mode is "normal", where voting remains open to every connected player as described in Voting Restricted to the Current Segment and One Active Vote Per Player Per Card.

#### Scenario: Vote accepted from a player holding a Lead token
- **WHEN** a connected player who holds at least one Lead token casts a vote for an option on the room's actual current segment's card, while the room is in "hunted" mode
- **THEN** the system records the vote

#### Scenario: New vote or change of option rejected from a player holding no Lead tokens
- **WHEN** a connected player who holds zero Lead tokens attempts to cast a new vote, or change an existing vote to a different option, while the room is in "hunted" mode
- **THEN** the system rejects the attempt and no vote is recorded, and any previous vote by that player is unchanged

#### Scenario: Normal mode is unaffected
- **WHEN** the room's mode is "normal"
- **THEN** any connected player may cast or change a skill-check vote regardless of how many Lead tokens they hold

#### Scenario: Retraction is exempt from the token gate
- **WHEN** a player holding zero Lead tokens retracts an existing vote by casting a vote for the option they already have an active vote on
- **THEN** the system permits the retraction (see Vote Retraction), even though the player holds no Lead tokens

### Requirement: Vote Retraction
When a player casts a vote for the option they currently have an active vote on, on the room's actual current segment's card, the system SHALL treat this as a retraction: it SHALL remove that player's vote from the card, leaving them with no active vote on it, rather than recording a new vote. Retraction SHALL be permitted regardless of how many Lead tokens the player holds, and SHALL NOT consume a Lead token. This applies in both "normal" and "hunted" mode.

#### Scenario: Player retracts their vote
- **WHEN** a player who has an active vote for an option on the room's actual current segment's card casts a vote for that same option again
- **THEN** the system removes that player's vote from the card
- **AND** the player has no active vote on the card afterward

#### Scenario: Retraction is visible to all players
- **WHEN** a player retracts their vote
- **THEN** every connected player's view of the card updates so the retracting player's label no longer appears next to the previously-voted option

#### Scenario: Retraction never consumes a Lead token
- **WHEN** a player retracts a vote while the room is in "hunted" mode
- **THEN** the player's Lead token count is unchanged

#### Scenario: Retraction works in normal mode
- **WHEN** a player retracts their vote while the room's mode is "normal"
- **THEN** the system removes the vote, the same as it would in "hunted" mode

#### Scenario: Voting for a different option after retracting is a new vote
- **WHEN** a player who currently has no active vote on a card casts a vote for one of its options
- **THEN** the system records it as a new vote, not a retraction, subject to the normal Lead-token gate while the room is in "hunted" mode

### Requirement: Vote Visibility
Votes on the room's actual current segment's card SHALL be visible to every connected player in the room in real time. For each option that has at least one vote, the client SHALL display, next to that option's icon, a label identifying every player who voted for it.

#### Scenario: A vote becomes visible to all players
- **WHEN** a connected player casts a vote for an option
- **THEN** every connected player's view of the card updates to show a label identifying that player next to the voted option's icon

#### Scenario: Multiple players voting for the same option
- **WHEN** two or more connected players vote for the same option
- **THEN** the card displays a label identifying each of those players next to that option's icon

#### Scenario: Changing a vote updates the label's position
- **WHEN** a player changes their vote from one option to another
- **THEN** every connected player's view updates so the player's label moves from the old option to the newly voted option

### Requirement: Vote Persistence
A player's vote on a card SHALL be persisted so that it is still recorded when that player reconnects to the room, or when the room's process is recreated, matching the persistence guarantee of the card's own contents.

#### Scenario: Vote survives reconnect
- **WHEN** a player who has voted on the current segment's card disconnects and later reconnects to the same room
- **THEN** the player's vote is still recorded and visible to the room

#### Scenario: Vote survives room recreation
- **WHEN** a room's live process fully disposes and is later recreated for the same room code
- **THEN** votes previously cast on that room's still-relevant segment cards are still recorded and visible
