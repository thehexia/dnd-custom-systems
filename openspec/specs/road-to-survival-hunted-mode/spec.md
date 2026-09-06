# road-to-survival-hunted-mode Specification

## Purpose

Lets a room's admin switch between Normal Mode and a higher-tension Hunted Mode, in which the party can vote for a "Forced March" through the current segment, the admin decides whether to confirm it, and confirming lets the admin reward the party with spendable "Lead" tokens that gate who may vote on skill-check rolls.

## Requirements

### Requirement: Admin Toggles Room Mode
The system SHALL allow only a room's admin to switch that room's mode between "normal" and "hunted", at any time the room exists, in either direction. A newly created room SHALL start in "normal" mode.

#### Scenario: Room starts in normal mode
- **WHEN** a room is created
- **THEN** the room's mode is "normal"

#### Scenario: Admin switches to Hunted Mode
- **WHEN** the room's admin switches the room's mode to "hunted"
- **THEN** the room's mode becomes "hunted" for all connected players

#### Scenario: Admin switches back to normal mode
- **WHEN** the room's admin switches a room in "hunted" mode back to "normal"
- **THEN** the room's mode becomes "normal" for all connected players

#### Scenario: Non-admin cannot change the room's mode
- **WHEN** a non-admin player attempts to switch the room's mode
- **THEN** the system rejects the attempt and the room's mode is unchanged

### Requirement: Switching to Normal Mode Clears Lead Tokens
When the room's admin switches the room's mode to "normal", the system SHALL clear every player's held Lead tokens to zero (see Lead Token Assignment).

#### Scenario: Lead tokens cleared on mode switch
- **WHEN** the room's admin switches a "hunted" mode room, in which one or more players hold one or more Lead tokens, to "normal" mode
- **THEN** every player's Lead token count is reset to zero

### Requirement: Forced March Vote
While a room is in "hunted" mode and its timeline phase is "active", the system SHALL allow each connected non-admin player to cast a vote for a Forced March through the current segment. The system SHALL reject a Forced March vote from the room's admin. A player's vote SHALL be visible to all connected players. The system SHALL reject a Forced March vote while the room's mode is "normal" or the timeline phase is not "active".

#### Scenario: Player casts a Forced March vote
- **WHEN** a connected non-admin player in a "hunted" mode room, with the timeline phase "active", casts a Forced March vote
- **THEN** the system records that player's vote
- **AND** all connected players observe the updated vote state

#### Scenario: Admin cannot vote for a Forced March
- **WHEN** the room's admin, connected to a "hunted" mode room with the timeline phase "active", attempts to cast a Forced March vote
- **THEN** the system rejects the attempt and no vote is recorded

#### Scenario: Forced March vote rejected in normal mode
- **WHEN** a connected player attempts to cast a Forced March vote while the room's mode is "normal"
- **THEN** the system rejects the attempt and no vote is recorded

#### Scenario: Forced March vote rejected outside the active phase
- **WHEN** a connected player attempts to cast a Forced March vote while the room's mode is "hunted" but the timeline phase is not "active"
- **THEN** the system rejects the attempt and no vote is recorded

### Requirement: Majority Forced March Vote Awaits Admin Confirmation
While a room is in "hunted" mode, when more than half of the room's currently connected non-admin players have cast a Forced March vote for the current segment, the system SHALL NOT advance the timeline on its own. Instead it SHALL mark the Forced March as awaiting the admin's confirmation (see Admin Confirms the Forced March). The system SHALL evaluate the majority only against currently connected non-admin players (the admin is excluded from both the vote count and the total, per Forced March Vote), and SHALL clear the awaiting-confirmation state, without advancing the timeline, if the majority is no longer met (e.g. because a voting player disconnected) before the admin confirms it.

#### Scenario: Majority Forced March vote becomes available for confirmation, without advancing
- **WHEN** more than half of a room's currently connected non-admin players have cast a Forced March vote for the current segment
- **THEN** the system marks the Forced March as awaiting admin confirmation
- **AND** the timeline does not advance on its own

#### Scenario: Vote short of majority is not available for confirmation
- **WHEN** half or fewer of a room's currently connected non-admin players have cast a Forced March vote for the current segment
- **THEN** the system does not mark the Forced March as awaiting admin confirmation

#### Scenario: Disconnected players do not count toward the majority
- **WHEN** a player disconnects from a "hunted" mode room after casting a Forced March vote
- **THEN** the system evaluates the majority only against currently connected non-admin players, excluding the disconnected player from both the vote count and the total

#### Scenario: Losing the majority before confirmation clears the awaiting state
- **WHEN** a Forced March is awaiting admin confirmation and enough voting players disconnect that a majority of currently connected non-admin players is no longer met
- **THEN** the system clears the awaiting-confirmation state
- **AND** the timeline does not advance

### Requirement: Forced March Vote Locked While a Skill-Check Vote Is Active
While any connected player holds an active skill-check vote on the room's actual current segment's card, the system SHALL reject any player's attempt to cast a Forced March vote for that segment. When a player casts a new skill-check vote, or changes an existing one to a different option, while the room is in "hunted" mode, the system SHALL clear every player's Forced March vote for the current segment and clear any awaiting-confirmation state, even if a majority had already been reached and was awaiting the admin's confirmation. Retracting a skill-check vote SHALL NOT itself clear Forced March vote state.

#### Scenario: Forced March vote rejected while a skill-check vote is active
- **WHEN** a connected player attempts to cast a Forced March vote while any connected player holds an active skill-check vote on the current segment's card
- **THEN** the system rejects the attempt and no vote is recorded

#### Scenario: Casting or changing a skill-check vote withdraws an in-progress Forced March
- **WHEN** a player casts a new skill-check vote, or changes to a different option, on the room's current segment while the room is in "hunted" mode
- **THEN** the system clears every player's Forced March vote for the current segment
- **AND** clears any awaiting-confirmation state, even if a majority had already been reached

#### Scenario: Retraction does not clear Forced March vote state
- **WHEN** a player retracts their skill-check vote
- **THEN** the system does not clear any other player's Forced March vote or awaiting-confirmation state as a result

#### Scenario: Forced March voting becomes available again once no active skill-check vote remains
- **WHEN** every active skill-check vote on the current segment's card has been retracted
- **THEN** the system once again accepts Forced March votes from connected non-admin players

### Requirement: Admin Confirms the Forced March
While a Forced March is awaiting admin confirmation (see Majority Forced March Vote Awaits Admin Confirmation), the system SHALL allow only the room's admin to confirm it. Confirming SHALL advance the timeline exactly as it would when every connected player readies up (see the `road-to-survival-timeline-board` capability's Segment Advances and Week-End Decision Point requirements), and SHALL clear every player's Forced March vote for the segment the timeline lands on. The system SHALL reject a confirmation attempt when no Forced March is awaiting confirmation, or from a non-admin player.

#### Scenario: Admin confirms and the segment advances
- **WHEN** the room's admin confirms a Forced March that is awaiting confirmation, and the current segment is not the week's last segment
- **THEN** the system advances the timeline to the next segment
- **AND** clears every player's Forced March vote

#### Scenario: Admin confirms at the week's last segment enters week-end decision
- **WHEN** the room's admin confirms a Forced March that is awaiting confirmation while the timeline is at the week's last segment
- **THEN** the system enters the week-end decision state for that room, the same as if every connected player had readied up

#### Scenario: Confirmation rejected without an awaiting Forced March
- **WHEN** the room's admin attempts to confirm while no Forced March is awaiting confirmation
- **THEN** the system rejects the attempt and the timeline is unaffected

#### Scenario: Non-admin cannot confirm
- **WHEN** a non-admin player attempts to confirm a Forced March that is awaiting confirmation
- **THEN** the system rejects the attempt and the timeline is unaffected

### Requirement: Lead Token Consumed When a Segment Advances
While the room's mode is "hunted", when the timeline's current segment advances — whether by every connected player readying up, an admin confirming a Forced March, or an admin's forward override — the system SHALL, for every currently connected player who holds an active skill-check vote on the segment being left, reduce that player's Lead token count by exactly one. A Lead token SHALL NOT be consumed merely by a player casting or changing a skill-check vote; it is consumed only when the segment that vote was cast on is left. The system SHALL NOT consume a Lead token when the admin steps the timeline backward. Per Forced March Vote Locked While a Skill-Check Vote Is Active, a Forced March can never be confirmed while any player holds an active skill-check vote, so in practice only ready-up and the admin's forward override ever consume a token this way.

#### Scenario: Ready-up consumes tokens for active voters
- **WHEN** every connected player readies up while the room is in "hunted" mode, and one or more of them hold an active skill-check vote on the current segment's card
- **THEN** each of those players' Lead token count decreases by exactly one as the segment advances

#### Scenario: A confirmed Forced March never has an active vote to consume
- **WHEN** the admin confirms a Forced March
- **THEN** no connected player holds an active skill-check vote on the segment being left (see Forced March Vote Locked While a Skill-Check Vote Is Active), so no player's Lead token count changes as a result of this advance

#### Scenario: An admin's forward override consumes tokens for active voters
- **WHEN** the admin steps the timeline forward while one or more connected players hold an active skill-check vote on the current segment's card
- **THEN** each of those players' Lead token count decreases by exactly one as the segment advances

#### Scenario: A player without an active vote is unaffected
- **WHEN** the segment advances and a connected player holds no active skill-check vote on the segment being left
- **THEN** that player's Lead token count is unchanged

#### Scenario: Casting a vote alone does not consume a token
- **WHEN** a player casts or changes a skill-check vote while the room is in "hunted" mode
- **THEN** that player's Lead token count is unchanged until the segment advances

#### Scenario: An admin's backward override does not consume tokens
- **WHEN** the admin steps the timeline backward
- **THEN** no player's Lead token count changes as a result

### Requirement: Lead Token Assignment
When the admin confirms a Forced March (see Admin Confirms the Forced March), the system SHALL make available, to the room's admin only, a one-time action to assign an additional Lead token to every currently connected player, adding to any Lead tokens that player already holds. The system SHALL allow the admin to use this action at most once per confirmed Forced March, and SHALL reject the action when no Forced March has been confirmed since the action was last used, since the room entered "normal" mode, or since the room's mode most recently switched to "hunted".

#### Scenario: Admin assigns Lead tokens after a confirmed Forced March
- **WHEN** the room's admin uses the Lead token assignment action after confirming a Forced March
- **THEN** every currently connected player's Lead token count increases by one

#### Scenario: Assignment stacks on top of tokens a player already holds
- **WHEN** a player already holds one or more Lead tokens and the room's admin uses the Lead token assignment action after confirming another Forced March
- **THEN** that player's Lead token count increases by one, on top of the tokens they already held

#### Scenario: Assignment action unavailable without a preceding confirmed Forced March
- **WHEN** the room's admin attempts to use the Lead token assignment action while no Forced March has been confirmed since the last assignment (or since entering "hunted" mode)
- **THEN** the system rejects the attempt and no Lead tokens are assigned

#### Scenario: Assignment is a deliberate admin choice, not automatic
- **WHEN** the admin confirms a Forced March
- **THEN** the system does not itself assign Lead tokens to any player unless and until the admin uses the assignment action

#### Scenario: Non-admin cannot assign Lead tokens
- **WHEN** a non-admin player attempts to use the Lead token assignment action
- **THEN** the system rejects the attempt and no Lead tokens are assigned

#### Scenario: Assignment action becomes unavailable again after use
- **WHEN** the room's admin uses the Lead token assignment action
- **THEN** the action is unavailable again until another Forced March is confirmed
