## ADDED Requirements

### Requirement: Admin Override of Segment Advancement
While a room's timeline is in the "active" phase, the system SHALL allow only the room's admin to step the room's actual current segment forward or backward by exactly one, bypassing the requirement that every connected player be ready. Advancing forward from the week's last segment SHALL enter the week-end decision state, the same transition that full-ready advancement triggers. Stepping backward from segment 1 of the current week SHALL have no effect; the timeline SHALL NOT cross into the previous week. Either direction SHALL reset every connected player's readiness to not-ready for the segment the timeline lands on. The system SHALL reject the override when the room's timeline is not in the "active" phase, and SHALL reject it from a non-admin player.

#### Scenario: Admin advances the segment without full readiness
- **WHEN** the room's admin triggers a forward override while at least one connected player is not ready, and the current segment is not the week's last segment
- **THEN** the system advances the timeline to the next segment
- **AND** resets every connected player's readiness to not-ready

#### Scenario: Admin forward override at the week's last segment enters week-end decision
- **WHEN** the room's admin triggers a forward override while the timeline is at the week's last segment
- **THEN** the system enters the week-end decision state for that room, the same as if every connected player had readied up

#### Scenario: Admin rewinds the segment
- **WHEN** the room's admin triggers a backward override while the timeline is at a segment other than segment 1
- **THEN** the system moves the timeline back to the previous segment
- **AND** resets every connected player's readiness to not-ready

#### Scenario: Admin backward override at segment 1 has no effect
- **WHEN** the room's admin triggers a backward override while the timeline is at segment 1 of the current week
- **THEN** the timeline remains at segment 1 of the current week
- **AND** the week number is unchanged

#### Scenario: Non-admin cannot use the override
- **WHEN** a non-admin player attempts to trigger a forward or backward override
- **THEN** the system rejects the attempt and the timeline is unaffected

#### Scenario: Override rejected during the week-end decision state
- **WHEN** the room's admin attempts a forward or backward override while the room is in the week-end decision state
- **THEN** the system rejects the attempt and the room remains in the week-end decision state, unresolved

#### Scenario: Override rejected in the game-over state
- **WHEN** the room's admin attempts a forward or backward override while the room is in the game-over state
- **THEN** the system rejects the attempt and the room remains in the game-over state
