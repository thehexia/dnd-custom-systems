## Context

See proposal.md - Why. Relevant constraints:

- `games/road-to-survival/server` is a Colyseus (WebSocket) + Express server with Prisma → Postgres. It currently only runs via `npm run dev` against a local Docker Compose Postgres.
- `games/road-to-survival/client` is a static Phaser/Vite build with no server-side rendering needs.
- Azure subscription `6c001a0e-0d97-406c-9d7c-4a19a844e1f9` already has `rg-terraform-state` / `hnguyentfstate` with a blob container provisioned for remote state (confirmed pre-existing by the user).
- Verified against the current codebase: the server already reads its Postgres connection string via Prisma's `env("DATABASE_URL")` and its listen port via `process.env.SERVER_PORT` (both with local-friendly defaults), and the client already reads `import.meta.env.VITE_SERVER_URL` with a `ws://localhost:2567` default (`client/src/net/room.ts`, `client/src/net/version.ts`). No application code changes are needed to support both environments — deployment is a matter of supplying different config values, not different code.
- Decisions below reflect explicit user tradeoffs already made: Container Apps with `minReplicas = 0` (accepting dropped in-memory state on scale-to-zero) over Basic App Service or a self-managed VM; Neon (external, free-tier, autosuspend/autoresume Postgres) over Azure Flexible Server, Flexible Server with stop/start automation, containerized Postgres, or Supabase; single environment; Static Web Apps Free tier for the client.

## Goals / Non-Goals

**Goals:**
- Terraform-defined, reproducible Azure environment for `road-to-survival`, applied from a developer machine (no CI/CD pipeline required by this change).
- Minimize idle and fixed recurring cost, in line with the user's explicit tier choices.
- Keep the Terraform project scoped to this one game, consistent with the monorepo's per-game domain convention.

**Non-Goals:**
- No CI/CD pipeline (e.g. GitHub Actions deploy workflow) — out of scope; may follow in a later change.
- No custom domain / DNS setup — resources use their Azure-assigned default hostnames.
- No mitigation for the scale-to-zero state-loss tradeoff (e.g. moving room state to Postgres, `minReplicas = 1`) — accepted as-is per proposal.md.
- No dev/staging/prod environment separation.
- No monitoring/alerting stack beyond what Azure provides by default.

## Decisions

### 1. Terraform project location: `games/road-to-survival/infra/`
Keeps infra colocated with the game it deploys, consistent with the repo's per-game-subfolder convention (`games/<game-name>/...`) and the OpenSpec domain-naming rule (`road-to-survival-*`). Alternative considered: a repo-root `infra/` directory — rejected because this repo is a multi-game monorepo and infra should scale the same way specs do, per game.

### 2. Server compute: Azure Container Apps (Consumption plan, `minReplicas = 0`)
Chosen over Basic App Service (reliable but ~$13/mo fixed) and a self-managed B1s VM (cheapest fixed cost but manual patching/process supervision) because Container Apps supports WebSockets, scales to zero between game sessions, and needs no OS management. Requires the server to run as a container image, so this change also introduces:
- A `Dockerfile` for `games/road-to-survival/server` (Node 20+ base image, production build of the Colyseus/Express app).
- An Azure Container Registry (Basic tier — cheapest SKU with private repos) to host that image, since Container Apps pulls from a registry rather than building in-place.

Tradeoff accepted explicitly by the user: scale-to-zero can drop in-memory room state mid-session. No mitigation in scope (see Non-Goals).

### 3. Database: Neon (managed serverless Postgres, free tier)
Neon's autosuspend-on-idle / autoresume-on-connect model mirrors the Container App's own scale-to-zero behavior (Decision 2), so both compute layers idle down together at essentially zero marginal cost. It's genuinely free at this project's scale and speaks standard Postgres wire protocol, so no ORM/Prisma changes are needed beyond the connection string.

Alternatives considered, all discussed explicitly with the user and rejected:
- **Azure Database for PostgreSQL Flexible Server, Burstable B1ms** (the original plan) — a fixed ~$12-15/mo cost that runs whether or not anyone is playing.
- **Flexible Server with scripted stop/start automation** — would cut Flexible Server's cost to ~$3-4/mo (storage-only while stopped), but needs bespoke scheduling/automation, doesn't auto-resume mid-session the way Neon does, and Azure force-restarts a stopped server after 7 days for maintenance.
- **Postgres in a container (Container Apps/ACI) with a persistent volume** — no managed backups/patching, and real risk of data corruption if the container is killed mid-write during scale-down.
- **Supabase** (also free) — its free-tier projects pause after 7 days of inactivity and need a manual resume via dashboard/API, which doesn't fit a game that might sit untouched between sessions.

### 4. Networking: Neon over the public internet (TLS), no Azure VNet
Neon is not an Azure resource, so there's no VNet/private-endpoint path between it and the Container App. The server reaches Neon over the public internet using Neon's TLS-required connection string (`sslmode=require`), authenticated via a Neon-issued role/password rather than Azure network-level firewall rules — Neon's free tier doesn't offer IP allow-listing. The server's own application-level auth (already covered by the existing `road-to-survival-room-access` spec) remains the primary access control for the game itself.

### 5. Frontend: Azure Static Web Apps, Free tier
Matches the user's explicit ask ("cheapest or free... static web app for the frontend"). Free tier's bandwidth/storage limits are well above what a small multiplayer board game's static asset needs will hit. The client is configured with the deployed server's WebSocket URL via `VITE_SERVER_URL` at build time — the same env var the client already reads for local dev (default `ws://localhost:2567`), so no client code changes are needed. **Important**: the Azure build must set this to a `wss://` URL (the Container App's HTTPS/WSS ingress hostname), not `ws://` — the client is served over HTTPS from Static Web Apps, and browsers block insecure WebSocket connections from an HTTPS page (mixed content).

### 6. Terraform state backend
`azurerm` backend block pointing at the existing `hnguyentfstate` storage account / `rg-terraform-state` / subscription `6c001a0e-0d97-406c-9d7c-4a19a844e1f9`, with a state key scoped to this game/environment (e.g. `road-to-survival/terraform.tfstate`) so future games or environments can share the same storage account without key collisions. The blob container itself is treated as pre-existing (per user confirmation) and is only referenced, never declared as a managed resource — avoiding the chicken-and-egg problem of Terraform managing the backend it depends on.

### 7. Secret handling: managed identity + Container Apps native secrets, no Key Vault
For a single-environment, cost-conscious deployment, the cheapest and simplest secret handling avoids creating secrets where possible and uses the Container Apps platform's built-in secret storage for what remains:
- **ACR pull auth**: the Container App uses a system-assigned managed identity granted the `AcrPull` role on the registry, instead of ACR admin username/password — eliminating that secret entirely.
- **Runtime secrets** (the Neon connection string): stored as a native Container Apps `secret` (encrypted at rest by the platform) and injected via `secretRef` into the container's environment variables — no additional Azure resource required.
- **Apply-time secrets** (a Neon API token if its Terraform provider is used; Azure authentication): supplied via `TF_VAR_*` environment variables or a gitignored `*.tfvars` file, never committed to the repository.

Alternative considered: Azure Key Vault — rejected for this change. Its cost is also negligible at this scale, so this isn't a cost trade-off, but it adds a resource plus RBAC/access-policy wiring with no benefit for a single app with one runtime secret. Revisit if a future change adds multiple services that need to share secrets, or centralized rotation/audit becomes a requirement.

## Risks / Trade-offs

- **[Risk] Scale-to-zero drops in-memory game state mid-session** → Accepted per user decision; documented in proposal.md and the spec. Future change could persist room state to Postgres more aggressively if this becomes painful in practice.
- **[Risk] Cold start latency on first connection after idling** → Acceptable for a friends-and-family game; not mitigated in this change.
- **[Risk] Container Registry adds a small fixed monthly cost (Basic SKU, ~$5/mo)** → Necessary for Container Apps to pull the server image; still cheaper in aggregate than Basic App Service, and Basic ACR is the cheapest SKU with private repos.
- **[Risk] Public (non-VNet), TLS-only Postgres endpoint increases exposure surface** → Mitigated by Neon's required TLS and role-based auth; accepted given the personal-scale, non-VNet approach chosen for cost reasons.
- **[Risk] Neon is a dependency outside Azure and outside this project's `azurerm`-based Terraform** → Mitigated by using Neon's official Terraform provider where practical to keep provisioning declarative; accepted as a deliberate scope trade against an all-Azure deployment, made explicitly by the user for cost reasons.
- **[Risk] Neon's free-tier limits/availability are outside this project's control** → Neon could change free-tier terms or impose usage caps; acceptable given this is a personal/hobby-scale deployment — revisit if the game's usage grows.
- **[Trade-off] No CI/CD in this change** → Deploys (image build/push, Terraform apply, static build/publish) are manual/local until a follow-up change adds automation.
- **[Trade-off] No centralized secret rotation/audit (Key Vault deferred)** → Acceptable for a single-service, personal-scale deployment; revisit if secret sharing across services or stronger governance needs arise.

## Migration Plan

1. Bootstrap: confirm `hnguyentfstate` container access (already exists per user).
2. `terraform init` against the new backend config.
3. `terraform plan` / `terraform apply` to create the resource group, ACR, Container Apps environment + app (initially with a placeholder or first-built image), and Static Web App; provision the Neon project/database/role (via Neon's Terraform provider if used, otherwise via the Neon console/API as a one-time manual step) and capture its connection string.
4. Build and push the server's container image to ACR; update the Container App to reference it.
5. Build the client with the deployed server's endpoint configured, and publish it to the Static Web App.
6. No rollback beyond `terraform destroy`, since this is a net-new environment with no prior production traffic to preserve.

## Open Questions

None — the tier, environment-count, and state-backend decisions that would otherwise be open were resolved with the user before writing this design.
