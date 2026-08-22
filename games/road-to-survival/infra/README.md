# road-to-survival Azure infrastructure

Terraform for the `road-to-survival` game's Azure deployment: Container Apps (server),
Static Web Apps (client), and remote state in the pre-existing `hnguyentfstate` storage
account. Database is Neon (external, free tier) — not an Azure resource; see below.

See `../../../openspec/changes/road-to-survival-azure-infra/design.md` for the full
rationale behind each choice.

## Prerequisites

- Azure CLI, logged in to the right subscription: `az login`, then confirm with
  `az account show` that `id` is `6c001a0e-0d97-406c-9d7c-4a19a844e1f9`.
- Terraform >= 1.7.
- Docker, for building the server image.
- A Neon account (free tier) — https://neon.tech.

## One-time: Neon database

This change provisions Neon manually rather than via a Terraform provider (simpler for a
single database — see design.md, Decision 3).

1. Create a Neon project and database for `road-to-survival` (autosuspend stays at its
   default enabled setting).
2. Create a dedicated role/credentials for the server (don't reuse your Neon account's
   default role).
3. Copy the connection string and make sure it includes `sslmode=require`.
4. Export it for Terraform — never write it into a `.tfvars` file:
   ```bash
   export TF_VAR_neon_database_url="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
   ```

## Secrets

- **Apply-time** (the Neon connection string above; Azure auth): environment variables
  only (`TF_VAR_*`, `az login`), or a gitignored `terraform.tfvars` — never committed.
- **Runtime** (what the deployed server reads): stored as a native Container Apps
  `secret` and injected via `secretRef`, not Key Vault (see design.md, Decision 7).
- **Registry auth**: none needed — the Container App pulls from ACR using its own
  managed identity (`AcrPull` role), not ACR admin credentials.

## Deploying

```bash
cd games/road-to-survival/infra
cp terraform.tfvars.example terraform.tfvars   # adjust if needed; stays gitignored
terraform init
terraform plan
terraform apply
```

The first apply creates everything with a placeholder public image
(`mcr.microsoft.com/k8se/quickstart:latest`) and `use_acr_registry = false`, since the
`AcrPull` role assignment (which the real image needs) doesn't exist until after this
apply. This avoids a chicken-and-egg dependency between the Container App and its own
role assignment.

### Push the real server image

```bash
# from games/road-to-survival/
az acr login --name <container_registry_login_server output, without .azurecr.io>
docker build -f server/Dockerfile -t <login_server>/road-to-survival-server:latest .
docker push <login_server>/road-to-survival-server:latest
```

Then update `terraform.tfvars`:

```hcl
container_image  = "<login_server>/road-to-survival-server:latest"
use_acr_registry = true
```

```bash
terraform apply
```

### Apply Prisma migrations against Neon

From a machine with the Neon connection string available:

```bash
cd games/road-to-survival/server
DATABASE_URL="<neon connection string>" npx prisma migrate deploy
```

### Build and deploy the client

```bash
# from games/road-to-survival/
VITE_SERVER_URL="wss://<container_app_fqdn output>" npm run build --workspace=client
```

**Use `wss://`, not `ws://`** — the client is served over HTTPS from Static Web Apps,
and browsers block insecure WebSocket connections from an HTTPS page.

Deploy `client/dist` to the Static Web App using the deployment token in the
`static_web_app_api_key` output (sensitive):

```bash
terraform output -raw static_web_app_api_key | \
  npx @azure/static-web-apps-cli deploy client/dist --deployment-token -
```

## Cost

No fixed Azure Postgres cost (Neon is free-tier, external). The only guaranteed fixed
monthly cost is the Container Registry (Basic SKU, ~$5/mo); Container Apps and Static
Web Apps both target near-zero idle cost via scale-to-zero / the Free tier. Log
Analytics (required by the Container Apps environment) is usage-based with no fixed
fee, negligible at this project's log volume.
