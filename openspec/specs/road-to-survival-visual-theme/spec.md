## Purpose

Defines the shared hand-drawn, parchment-and-wood tabletop visual theme that every client UI surface must present, so the game reads as one consistent stylized board game rather than a mix of a default web-app theme and a partially-themed game board.

## Requirements

### Requirement: Unified Theme Across Client Surfaces
The client SHALL present a single, consistent hand-drawn tabletop visual theme — a shared color palette, a shared pair of typefaces (a display face for headings/banners and a body face for text), and a shared panel/texture treatment (parchment backgrounds, wood-grained panel borders) — across every player-facing UI surface: the room gate, the game HUD (ready control, player roster, week-end and game-over panels), the connection-status banner, and the timeline board.

#### Scenario: Room gate matches the game's theme
- **WHEN** a player views the room create/join screen
- **THEN** it uses the same color palette, typefaces, and panel/texture treatment as the in-game HUD and timeline board

#### Scenario: Connection-status banner matches the game's theme
- **WHEN** the connection-status banner is shown (e.g., stale connection, update available)
- **THEN** it uses the same color palette and typefaces as the rest of the client, rather than the prior mismatched flat red/amber styling

#### Scenario: Themed text remains legible
- **WHEN** a player views any themed panel with text over a parchment or wood-textured background
- **THEN** the text remains clearly legible against that background

### Requirement: Day/Night Segments Distinguished by Iconography
In addition to the existing day/night tile color styling on the timeline board, each segment tile SHALL display an icon (sun for day-time, moon for night-time) matching that segment's actual time-of-day, so day/night is distinguishable by iconography and not solely by color.

#### Scenario: Day-time segment shows a sun icon
- **WHEN** a player views a day-time segment's tile on the timeline board
- **THEN** the tile displays a sun icon

#### Scenario: Night-time segment shows a moon icon
- **WHEN** a player views a night-time segment's tile on the timeline board
- **THEN** the tile displays a moon icon

### Requirement: Attribution for Sourced Assets
Where the client's visual theme uses an asset whose license requires attribution, the client SHALL make that attribution available to players, and the project SHALL record each themed asset's source, author, and license.

#### Scenario: Player can find asset credits
- **WHEN** a player looks for asset credits within the game
- **THEN** the client presents a credits surface listing attribution-required assets and their authors

#### Scenario: Asset provenance is recorded in the project
- **WHEN** a themed asset requiring attribution is added to the project
- **THEN** its source, author, and license are recorded in a project attributions record
