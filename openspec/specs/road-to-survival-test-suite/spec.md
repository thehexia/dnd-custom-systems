# road-to-survival-test-suite Specification

## Purpose

Defines the automated test coverage the road-to-survival client and server must maintain — unit, integration, and end-to-end — and the commands a contributor or CI system uses to run each suite.

## Requirements

### Requirement: Unit Test Coverage of Isolable Logic
The system SHALL provide unit tests for logic that can be exercised without a real database, network, or browser, covering room credential generation/verification, room-persistence helper functions (with the database dependency substituted), and client-side join/create-room helpers (with the DOM and realtime client substituted).

#### Scenario: Room code and password generation
- **WHEN** the unit suite runs
- **THEN** it verifies generated room codes and passwords conform to their expected length and character set, and that repeated generation produces varying output

#### Scenario: Password hash verification
- **WHEN** the unit suite runs
- **THEN** it verifies a password hashed by the system verifies successfully against its own hash, and an incorrect password fails verification

#### Scenario: Client join-gate helper behavior
- **WHEN** the unit suite runs
- **THEN** it verifies join-link construction, per-room remembered-username storage and retrieval, and error-message mapping for room-access failures, without requiring a running server

### Requirement: Integration Test Coverage Against a Real Postgres
The system SHALL provide integration tests that exercise room and player persistence against a real PostgreSQL database provisioned via Testcontainers, with schema migrations applied before tests run and the container torn down after the run completes. Integration tests SHALL NOT depend on a developer's local `docker-compose` Postgres instance or a shared external database.

#### Scenario: Room persistence round-trip against real Postgres
- **WHEN** the integration suite runs
- **THEN** it provisions a fresh Postgres container, applies migrations, creates a room and a room player through the persistence layer, and verifies the stored data can be read back correctly

#### Scenario: Room code uniqueness enforced by the database
- **WHEN** the integration suite attempts to persist two rooms whose generated codes collide
- **THEN** it verifies the database rejects or the persistence layer retries to guarantee the stored room codes remain unique

#### Scenario: Integration suite is isolated from the dev database
- **WHEN** the integration suite runs on a machine with no `docker-compose` Postgres running (or a different one running on the dev port)
- **THEN** the suite still passes, because it provisions and connects to its own Testcontainers-managed Postgres instance

### Requirement: End-to-End Automation Coverage of the Core User Journey
The system SHALL provide automated end-to-end tests that drive the real client against a real running server and a real Postgres instance to validate the core multiplayer join journey, without mocking the realtime connection or the database.

#### Scenario: Create, share, and join a room end-to-end
- **WHEN** the end-to-end suite runs
- **THEN** it automates one browser session creating a room and capturing the generated join link, code, and password, then a second browser session joining via the captured join link, and verifies both sessions observe each other's synced state

#### Scenario: Admin rejoin requires the room password end-to-end
- **WHEN** the end-to-end suite runs
- **THEN** it automates a room creator disconnecting and attempting to rejoin using the creator's username, and verifies rejoin without a password is rejected while rejoin with the correct password succeeds and restores prior state

### Requirement: Independently Runnable Test Suites
The system SHALL expose separate commands to run the unit, integration, and end-to-end suites independently, as well as a single command that runs all of them, so a contributor or CI system can choose the appropriate scope.

#### Scenario: Running a single suite
- **WHEN** a contributor runs the unit-only test command
- **THEN** only unit tests execute, and no Postgres container or browser automation is started

#### Scenario: Running everything
- **WHEN** a contributor runs the combined test command
- **THEN** the unit, integration, and end-to-end suites all execute and the command reports a single pass/fail result
