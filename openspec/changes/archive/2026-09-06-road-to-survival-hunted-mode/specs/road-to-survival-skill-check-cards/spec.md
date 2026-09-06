## ADDED Requirements

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
