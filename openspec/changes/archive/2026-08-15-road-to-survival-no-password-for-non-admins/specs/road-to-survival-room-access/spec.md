## MODIFIED Requirements

### Requirement: Joining a Room
The system SHALL allow a user to join an existing room by supplying the room's code and a username that is not currently in use by another connected player in that room and does not match the room's admin username. On success, a new player record SHALL be created in that room for the username. No room password is required to join with a new, non-admin username.

#### Scenario: Successful join with a new username
- **WHEN** a user submits a join request with a valid room code and a username not already active in that room
- **THEN** the system admits the user to the room as a new, non-admin player without requiring a password

#### Scenario: Join with unknown room code
- **WHEN** a user submits a join request with a room code that does not match any room
- **THEN** the system rejects the request with a generic invalid-access error

#### Scenario: Join with incorrect password
- **WHEN** a user submits a join request with a valid room code, a new non-admin username, and any password value (including an incorrect one, or none at all)
- **THEN** the system admits the user, since a password is never checked for a non-admin username

### Requirement: Rejoining a Room
The system SHALL allow a user to resume a previously established identity in a room by supplying the room's code and the exact username of an existing player record in that room. If that username matches the room's admin username, the system SHALL additionally require the room's password before reconnecting the user; for any other existing username, no password is required. On success, the system SHALL restore that player's previously persisted state, including admin status and last known game state.

#### Scenario: Successful rejoin restores prior state
- **WHEN** a user submits a join request with a valid room code and a username matching an existing, non-admin player record in that room
- **THEN** the system reconnects the user to that existing player record without requiring a password
- **AND** restores the player's previously persisted game state
- **AND** does not create a duplicate player record

#### Scenario: Successful admin rejoin with correct password
- **WHEN** a user submits a join request with a valid room code, a username matching the room's admin player record, and the room's matching password
- **THEN** the system reconnects the user to the admin player record
- **AND** restores the player's previously persisted game state and admin status
- **AND** does not create a duplicate player record

#### Scenario: Admin rejoin rejected without a valid password
- **WHEN** a user submits a join request with a valid room code and a username matching the room's admin player record, but omits the password or supplies a password that does not match the room's password
- **THEN** the system rejects the request with an error distinct from the generic invalid-access error, indicating that the room password is required for that username
- **AND** does not reconnect the user to the admin player record

#### Scenario: Rejoin works after the room's live process has stopped
- **WHEN** a user rejoins a room whose live game process had previously been stopped (e.g., due to inactivity or a server restart)
- **THEN** the system re-establishes a live process for that room, hydrated from persisted room and player data
- **AND** the rejoining player's state matches what was last persisted before the process stopped

## ADDED Requirements

### Requirement: Shareable Join Link
On successful room creation, the system SHALL present the creator with a shareable join link that encodes the room code, in addition to the plaintext room code and password. Opening the application via a join link SHALL take the user directly to a username-entry step for that room, without requiring the user to type the room code manually.

#### Scenario: Join link presented on room creation
- **WHEN** a room is created
- **THEN** the creator is shown a join link that encodes the newly generated room code, alongside the plaintext room code and password

#### Scenario: Following a join link skips manual code entry
- **WHEN** a user opens the application via a join link for a room
- **THEN** the application recognizes the room code carried by the link and presents only a username-entry step for that room, without requiring the user to type the room code

#### Scenario: Join link does not carry the room password
- **WHEN** a join link is generated for a room
- **THEN** the link encodes only the room code, and does not expose the room password

### Requirement: Browser-Remembered Username Per Room
For a given room, the system SHALL remember, within the user's browser, the most recent username that browser used to successfully join or rejoin that room, and SHALL pre-fill that username the next time that room's join/rejoin form is presented in that browser.

#### Scenario: Username pre-filled on return visit
- **WHEN** a user's browser previously joined or rejoined a specific room under a given username
- **AND** that user later opens the join/rejoin form for that same room in the same browser
- **THEN** the username field is pre-filled with the previously used username

#### Scenario: No pre-fill for a room never joined in this browser
- **WHEN** a user opens the join/rejoin form for a room that browser has not previously joined or rejoined
- **THEN** the username field has no pre-filled value from local storage

#### Scenario: Remembered username is per-room, not global
- **WHEN** a browser has previously used different usernames in two different rooms
- **THEN** opening the join/rejoin form for each of those rooms pre-fills that room's own remembered username, not the other room's

### Requirement: Copyable Room Credentials
On the room-created screen, the system SHALL let the creator copy the join link, the room code, and the room password to the clipboard individually, without needing to manually select the displayed text.

#### Scenario: Copy join link
- **WHEN** the creator activates the copy control next to the join link
- **THEN** the join link is copied to the clipboard

#### Scenario: Copy room code
- **WHEN** the creator activates the copy control next to the room code
- **THEN** the room code is copied to the clipboard

#### Scenario: Copy room password
- **WHEN** the creator activates the copy control next to the room password
- **THEN** the room password is copied to the clipboard
