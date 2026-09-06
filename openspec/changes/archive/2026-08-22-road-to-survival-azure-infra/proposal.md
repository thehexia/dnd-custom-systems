## Why

`road-to-survival` currently only runs locally (Docker Compose for Postgres, `npm run dev` for client/server). There is no cloud deployment, so the game can't be played by remote friends or shared as a running instance. We need a minimal, cost-optimized Azure deployment, defined as Terraform, so the game can be hosted reliably and reproducibly without hand-clicking resources in the Azure portal.

## What Changes

- Add a Terraform project (under `games/road-to-survival/infra/` or repo-level `infra/` — see design.md) that provisions:
  - A resource group for the game's Azure resources.
  - An Azure Container Apps environment + Container App (Consumption plan, `minReplicas = 0`) to run the Colyseus/Express server, since it needs WebSocket support and Container Apps is the cheapest option that supports it.
  - An Azure Static Web App (Free tier) to host the built Phaser/Vite client.
- Use Neon (external, free-tier, serverless Postgres) for the server's Prisma-backed data, instead of an Azure-managed Postgres offering — Neon's autosuspend-when-idle / autoresume-on-connection model mirrors the Container App's own scale-to-zero behavior and is genuinely free at this project's scale (see design.md for alternatives considered).
- Configure the Terraform `azurerm` backend to use remote state in the existing `hnguyentfstate` storage account (resource group `rg-terraform-state`, subscription `6c001a0e-0d97-406c-9d7c-4a19a844e1f9`); the blob container already exists and is referenced, not created, by this change.
- Single environment only (no dev/prod split) — matches the "cheapest possible" goal and the project's current single-instance usage.
- Document the accepted tradeoff of Container Apps scale-to-zero: if all players disconnect and the app scales down, in-memory Colyseus room state for any in-progress game is lost. No mitigation (e.g. `minReplicas = 1`, state persistence) is in scope for this change.
- **BREAKING**: N/A — this is a net-new deployment target; nothing existing is being replaced.

## Capabilities

### New Capabilities
- `road-to-survival-azure-infra`: Terraform-defined Azure infrastructure (Container Apps server, Neon Postgres, Static Web App frontend, remote state) for hosting the `road-to-survival` game.

### Modified Capabilities
_None — no existing spec's requirements change._

## Impact

- **New code**: Terraform configuration files (`.tf`), variables, and outputs; no application code changes.
- **New Azure resources**: resource group, Container Apps environment + app, Container Registry (or equivalent image source — see design.md), Static Web App.
- **New external (non-Azure) resource**: a Neon project/database/role, provisioned outside the `azurerm` Terraform provider (via Neon's own Terraform provider if practical, otherwise a documented manual/API step) — this is a deliberate scope departure from an all-Azure deployment, accepted for cost reasons.
- **Existing Azure resources referenced (not modified)**: `rg-terraform-state` resource group and `hnguyentfstate` storage account/container, used only as the Terraform backend.
- **Dependencies**: introduces a build/push step for a server container image (Colyseus server needs to run as a container on Container Apps), a build step for the static client, and an external account (Neon) that the server's database credentials depend on — all wired into a deploy process (covered in design.md/tasks.md).
- **Cost**: targets near-zero/idle cost via Container Apps scale-to-zero, Static Web Apps Free tier, and Neon's free tier with autosuspend — this deployment has no fixed Azure Postgres cost; Container Registry (Basic SKU, ~$5/mo) is the only guaranteed fixed monthly cost.
