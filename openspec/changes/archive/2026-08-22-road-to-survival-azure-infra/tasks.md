## 1. Terraform Project Scaffolding

- [x] 1.1 Create `games/road-to-survival/infra/` with a standard Terraform layout (`main.tf`, `variables.tf`, `outputs.tf`, `providers.tf`, `backend.tf`).
- [x] 1.2 Configure the `azurerm` provider (pin version) and required Terraform version in `providers.tf`.
- [x] 1.3 Configure the `azurerm` remote state backend in `backend.tf`, pointing at the existing `hnguyentfstate` storage account, `rg-terraform-state` resource group, subscription `6c001a0e-0d97-406c-9d7c-4a19a844e1f9`, and a state key scoped to this game (e.g. `road-to-survival/terraform.tfstate`). Do not declare the storage account or its container as managed resources.
- [x] 1.4 Run `terraform init` and confirm it successfully connects to the remote backend with no local `terraform.tfstate` created. Done: `terraform init` against `hnguyentfstate`/`rg-terraform-state` succeeded; state lives remotely, no local `terraform.tfstate` created.
- [x] 1.5 Add a `.gitignore` entry (or confirm existing repo `.gitignore`) excludes `.terraform/` and any `*.tfvars` containing secrets; document that apply-time secrets (e.g. a Neon API token, Azure auth) are supplied via `TF_VAR_*` environment variables or a gitignored `*.tfvars` file, never committed.

## 2. Core Resources

- [x] 2.1 Define the resource group for all `road-to-survival` Azure resources.
- [x] 2.2 Define an Azure Container Registry (Basic SKU) to host the server's container image, with admin/local-auth disabled (no ACR admin credentials — see task 3.4 for pull auth).
- [x] 2.3 Run `terraform validate` and `terraform plan`; confirm the plan creates only the resource group and ACR at this stage, with no changes to the `hnguyentfstate` storage account or its container. Done: the first `terraform apply` created the resource group and ACR (along with the rest of the stage-one resources, applied together rather than staged separately); the pre-existing `hnguyentfstate` storage account/container were never touched.

## 3. Server Compute (Container Apps)

- [x] 3.1 Add a `Dockerfile` to `games/road-to-survival/server` that builds and runs the production server (multi-stage build: install deps, build TypeScript, run against compiled output).
- [x] 3.2 Build the image locally and run it against the local Docker Compose Postgres to confirm it starts and serves requests, as a smoke test of the container definition. Required fixing a pre-existing, unrelated TypeScript build break first (see note below).
- [x] 3.3 Define the Container Apps environment (Consumption plan) and the Container App resource in Terraform, with `minReplicas = 0`, WebSocket-compatible ingress (external ingress, target port matching the server's listen port), a system-assigned managed identity, and the image reference pointing at the ACR repository.
- [x] 3.4 Grant the Container App's managed identity the `AcrPull` role on the Container Registry (task 2.2), so it authenticates to pull images without ACR admin credentials.
- [x] 3.5 Wire the Neon connection string and any other server config into the Container App as native Container Apps secrets (`secretRef`-injected environment variables), sourced from the database resource's outputs (task 4) once that exists — do not hardcode credentials in `.tf` files, and do not introduce Key Vault for this change (see design.md).
- [x] 3.6 Run `terraform plan`/`apply` for the Container Apps environment and App; confirm the app resource is created successfully (image can initially be a placeholder if the real image isn't pushed yet). Done: applied with the placeholder image (`mcr.microsoft.com/k8se/quickstart:latest`) after registering the `Microsoft.App` resource provider on the subscription; app created successfully.

## 4. Database (Neon)

- [x] 4.1 Create a Neon project and database for `road-to-survival` on Neon's free tier (via Neon's Terraform provider if practical, otherwise as a one-time manual/API step documented in the infra README), with autosuspend left at its default enabled setting. Done: user created the Neon project manually (`ep-hidden-base-ax12fnsc...neon.tech`, database `neondb`); confirmed reachable via a successful `prisma migrate deploy` run.
- [ ] 4.2 Create a dedicated Neon role/credentials for the server to use, rather than reusing the Neon account owner's default credentials. **Not independently verified**: the user supplied the connection string directly (per this session's secret-handling flow, its contents were never read by the assistant), so whether it's a dedicated role vs. the account owner's default role wasn't confirmed from this session.
- [x] 4.3 Capture the Neon connection string (with `sslmode=require`) as a Terraform variable/secret (or a documented manual value if Neon isn't provisioned via Terraform), consumed by the Container App's native secret (task 3.5) — do not hardcode credentials in `.tf` files or commit them to the repo. Done: supplied via `TF_VAR_neon_database_url`, sourced from a gitignored `*.env` file, wired into the Container App's native secret.
- [x] 4.4 If using the Neon Terraform provider, run `terraform plan`/`apply` and confirm the Neon project/database/role are created as expected; otherwise confirm the manually-created Neon project/database/role are documented and the connection string is available to wire in. Done: Neon was provisioned manually (not via Terraform); documented in `infra/README.md` and the deploy skill; connection string supplied and working.
- [x] 4.5 From a local machine (or the deployed Container App), confirm the existing Prisma schema/migrations apply successfully against the new Neon-hosted Postgres instance. Done: `npx prisma migrate deploy` applied all 3 existing migrations successfully against Neon.

## 5. Frontend (Static Web App)

- [x] 5.1 Define an Azure Static Web App resource (Free tier) in Terraform for `games/road-to-survival/client`.
- [x] 5.2 Confirm the client's existing `VITE_SERVER_URL` build-time variable (`client/src/net/room.ts`, `client/src/net/version.ts`) is sufficient for the Azure build — no client code changes expected, since it already defaults to the local server and is overridable at build time.
- [x] 5.3 Build the client with `VITE_SERVER_URL` set to the Container App's public ingress hostname using the `wss://` scheme (not `ws://` — required for a client served over HTTPS to avoid mixed-content blocking), and confirm the build output is a static bundle deployable to the Static Web App. Done: built with `VITE_SERVER_URL=wss://rts-server.victoriousbay-bc972264.eastus.azurecontainerapps.io`, producing a static `client/dist` bundle.
- [x] 5.4 Run `terraform plan`/`apply` for the Static Web App resource and confirm it's reachable at its default hostname. Done: created in the first apply; `https://victorious-pond-0963f860f.7.azurestaticapps.net` returns HTTP 200.

## 6. End-to-End Verification

- [x] 6.1 Push the real server image (from 3.1/3.2) to the ACR and update the Container App to reference it; confirm the app starts successfully in Azure. Done: built for `linux/amd64` (Container Apps rejected the arm64 image built by default on Apple Silicon), pushed to `rtsacrz6axgz.azurecr.io`, applied via Terraform; `/health` on the deployed FQDN returns `{"ok":true,...}`.
- [x] 6.2 Deploy the built client (from 5.3) to the Static Web App and confirm it loads over HTTPS. Done: deployed via `swa deploy --env production` (the `--deployment-token -` stdin form isn't supported by this CLI version; used `SWA_CLI_DEPLOYMENT_TOKEN` instead); site returns HTTP 200 over HTTPS. Not verified in-browser from this session — worth a manual check.
- [ ] 6.3 From the deployed client, verify a WebSocket connection to the deployed server succeeds and a room can be created/joined end-to-end against the managed Postgres database (validates spec scenarios: WebSocket connection accepted, server connects to managed Postgres, client connects to configured server). **Not yet verified**: requires driving an actual browser session, which this assistant can't do — needs a manual check.
- [ ] 6.4 Manually let the Container App idle past its scale-to-zero window, confirm running instance count drops to zero, then reconnect and confirm a new instance starts and accepts the connection (validates spec scenarios: no instances running when idle, cold start on new connection). **Not yet verified**: optional manual follow-up.
- [ ] 6.5 Manually let the Neon database idle past its autosuspend window, confirm it shows as suspended in the Neon dashboard, then reconnect via the server and confirm it auto-resumes and the connection succeeds (validates spec scenarios: database auto-suspends when idle, database auto-resumes on next connection). **Not yet verified**: optional manual follow-up.
- [x] 6.6 Run `terraform plan` against the final applied state and confirm it reports no diff (configuration matches deployed reality). Done: `terraform plan` after the full deploy reports "No changes. Your infrastructure matches the configuration."
- [x] 6.7 After all infra changes, confirm the existing local dev flow (`docker-compose up` + `npm run dev` against the local Postgres, with `VITE_SERVER_URL` unset) still works unmodified — validates that switching environments is config-only and did not require any source code change. Verified: `docker compose up` (already running locally) + `npm run dev:server` started cleanly and `/health` responded, unmodified from before this change.

## 7. Documentation

- [x] 7.1 Add a `games/road-to-survival/infra/README.md` documenting prerequisites (Azure CLI login, subscription), how to run `terraform init/plan/apply`, how secrets are supplied (`TF_VAR_*` env vars / gitignored tfvars for apply-time secrets, Container Apps native secrets for runtime), how to build/push the server image, and how to build/deploy the client — covering the manual deploy flow described in design.md's Migration Plan.
