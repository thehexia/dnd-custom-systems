## Purpose

Defines the Azure infrastructure, provisioned via Terraform, that hosts the `road-to-survival` game's server, database, and client so the game can be played over the internet rather than only locally.

## ADDED Requirements

### Requirement: Infrastructure Defined as Terraform
All Azure resources for hosting `road-to-survival` SHALL be defined as Terraform configuration, so the environment can be reproduced or rebuilt from source rather than depending on manually-created portal resources.

#### Scenario: Resources created from Terraform
- **WHEN** the Terraform configuration is applied against an empty Azure subscription (aside from the pre-existing state backend)
- **THEN** the resource group, server compute, database, and static frontend resources described in this spec are created without manual portal steps

### Requirement: Remote Terraform State
Terraform state for this infrastructure SHALL be stored remotely in the existing `hnguyentfstate` Azure Storage Account (resource group `rg-terraform-state`), rather than as local state files, so state is durable and shareable.

#### Scenario: State stored remotely, not locally
- **WHEN** `terraform init` is run against this configuration
- **THEN** Terraform configures its backend to read and write state from a blob container in the `hnguyentfstate` storage account
- **AND** no `terraform.tfstate` file is created or relied upon in the local working directory

### Requirement: Single Environment
The Terraform configuration SHALL provision exactly one environment (no separate dev/staging/prod resource sets), matching the project's current single-instance usage.

#### Scenario: One set of resources per apply
- **WHEN** the Terraform configuration is applied
- **THEN** exactly one resource group, one server compute resource, one database, and one static site are created — not multiple parallel environments

### Requirement: WebSocket-Capable Server Hosting
The `road-to-survival` server SHALL be hosted on Azure compute that supports persistent WebSocket connections, since the Colyseus game server requires them for real-time multiplayer state sync.

#### Scenario: WebSocket connection accepted
- **WHEN** a client opens a WebSocket connection to the deployed server's public endpoint
- **THEN** the connection is accepted and remains open for the duration of an active game session

### Requirement: Server Compute Scales to Zero When Idle
The server compute resource SHALL be configured to scale down to zero running instances when there is no active traffic, to minimize cost between game sessions.

#### Scenario: No instances running when idle
- **WHEN** no client has connected to the server for the platform's configured idle window
- **THEN** the number of running server instances is zero

#### Scenario: Cold start on new connection
- **WHEN** a client connects after the server has scaled to zero
- **THEN** the platform starts a new instance and the connection succeeds once the instance is ready, without requiring manual intervention

#### Scenario: In-progress game state is not preserved across scale-to-zero
- **WHEN** the server scales down to zero instances while a game room has in-memory-only state
- **THEN** that in-memory state is lost, and a subsequent connection starts from a fresh instance with only durably-persisted (database-backed) state available

### Requirement: Managed PostgreSQL Database
The server's database SHALL be a managed, serverless PostgreSQL instance (Neon, free tier) that automatically suspends when idle and automatically resumes on the next connection, so cost and behavior track the game's actual usage without manual intervention.

#### Scenario: Server connects to managed Postgres
- **WHEN** the deployed server starts and runs its Prisma migrations/connections
- **THEN** it successfully connects to the Neon-hosted PostgreSQL instance using connection details supplied via configuration

#### Scenario: Database auto-suspends when idle
- **WHEN** no connection has been made to the database for the provider's configured idle window
- **THEN** the database compute suspends, incurring no compute cost while suspended

#### Scenario: Database auto-resumes on next connection
- **WHEN** the server opens a new connection after the database has suspended
- **THEN** the database automatically resumes and the connection succeeds without manual intervention

### Requirement: Static Frontend Hosting
The `road-to-survival` client SHALL be hosted on Azure Static Web Apps on the Free tier, serving the built Phaser/Vite client assets.

#### Scenario: Client served over HTTPS
- **WHEN** a browser requests the Static Web App's default hostname
- **THEN** the built client application is served over HTTPS

### Requirement: Server Endpoint Configurable in Client
The deployed client SHALL be able to reach the deployed server's public endpoint without requiring a client code change per deployment (e.g., via a build-time or runtime configuration value).

#### Scenario: Client connects to configured server
- **WHEN** the deployed client establishes its game connection
- **THEN** it connects to the server endpoint supplied via that deployment's configuration, not a hardcoded local address

### Requirement: Same Codebase Runs Locally and in Azure via Configuration Only
The server and client SHALL run correctly against either the local development environment (Docker Compose Postgres, local server) or the Azure-deployed environment (Neon, deployed Container App) using only environment-variable or build-time configuration differences. No source code change SHALL be required to switch between the two.

#### Scenario: Server runs unmodified against local or deployed database
- **WHEN** the server process is started with its database connection string pointing at either the local Docker Compose Postgres or the deployed Neon database
- **THEN** the server connects and operates correctly in both cases without any source code change

#### Scenario: Client connects to local or deployed server via build-time configuration
- **WHEN** the client is built with its server-endpoint configuration unset (defaulting to the local server) or set to the deployed server's endpoint
- **THEN** the resulting build connects to the correct server for that configuration without any source code change

#### Scenario: Deployed client uses a secure WebSocket URL
- **WHEN** the client is built for the Azure deployment
- **THEN** its configured server endpoint uses the secure WebSocket scheme (`wss://`, not `ws://`), since the client is served over HTTPS and browsers block insecure WebSocket connections initiated from an HTTPS page

### Requirement: State Backend Uses Pre-Existing Storage
This Terraform configuration SHALL reference the pre-existing `hnguyentfstate` storage account and its blob container as the state backend and SHALL NOT attempt to create or manage that storage account or container as a resource.

#### Scenario: Backend resources not managed by this configuration
- **WHEN** `terraform plan` is run
- **THEN** the plan includes no create, update, or destroy action against the `hnguyentfstate` storage account or its state container
