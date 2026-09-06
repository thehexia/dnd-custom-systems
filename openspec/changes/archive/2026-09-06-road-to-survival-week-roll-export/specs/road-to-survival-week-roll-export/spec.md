## Purpose

Lets the room's admin pull every segment's skill-check card and its votes for the current week out of the live game as a single downloadable Markdown document, so the table has a record of the week after it ends.

## ADDED Requirements

### Requirement: Export Restricted to Admin
The system SHALL only generate a week export in response to a request from the room's admin. The system SHALL reject an export request from a non-admin player and SHALL NOT return any card or vote data to that requester.

#### Scenario: Admin requests the export
- **WHEN** the room's admin requests a week export
- **THEN** the system generates and returns the Markdown export

#### Scenario: Non-admin request is rejected
- **WHEN** a connected player who is not the room's admin requests a week export
- **THEN** the system rejects the request and returns no card or vote data

### Requirement: Export Covers Every Segment of the Current Week
An export request SHALL produce a document covering every segment of the room's actual current week, from segment 1 through the week's last segment, regardless of which segment is currently being viewed. A segment that has not yet been generated SHALL NOT be included.

#### Scenario: Export includes all generated segments of the current week
- **WHEN** the admin requests a week export while the room is partway through its current week
- **THEN** the returned document includes every segment of that week that has been generated so far, in segment order

### Requirement: Export Content Per Segment
For each segment included in the export, the document SHALL list the segment's day and time-of-day, all four of its skill-check options with each option's skill and DC, and, for each option, the connected room's list of players who voted for it (or an explicit indication that no one voted for it).

#### Scenario: Segment with votes on multiple options
- **WHEN** a segment's card has votes recorded for more than one of its four options
- **THEN** the export lists each option's skill and DC, and lists the voting player(s) next to each option that has votes

#### Scenario: Segment with an unvoted option
- **WHEN** a segment's card has an option with no recorded votes
- **THEN** the export shows that option's skill and DC with an explicit indication that no one voted for it

### Requirement: Export Reflects Live Data at Request Time
The export SHALL be generated fresh from the room's current card and vote data at the time of the request; it SHALL NOT be served from a previously cached or stored copy.

#### Scenario: Vote cast after a prior export is reflected in a new export
- **WHEN** a player votes on the current segment after the admin has already exported the week once, and the admin requests the export again
- **THEN** the second export reflects the newly cast vote

### Requirement: Export Delivered as a Downloadable Markdown File
The system SHALL deliver the export to the requesting admin's client as Markdown-formatted text, and the client SHALL save it as a downloaded `.md` file.

#### Scenario: Admin downloads the export
- **WHEN** the admin's client receives a generated week export
- **THEN** the client triggers a browser download of the content as a `.md` file
