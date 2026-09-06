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
docker build --platform linux/amd64 -f server/Dockerfile -t <login_server>/road-to-survival-server:latest .
docker push <login_server>/road-to-survival-server:latest
```

**`--platform linux/amd64` is required on Apple Silicon (and any arm64) machines** —
Container Apps only runs linux/amd64. Without it, `docker build` defaults to the
host architecture; the push succeeds and the revision looks healthy right up until
the container fails at startup with `exec format error` (visible via `az
containerapp logs show`). Sanity-check before pushing:

```bash
docker inspect <login_server>/road-to-survival-server:latest --format '{{.Architecture}}/{{.Os}}'
# must print: amd64/linux
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
# from games/road-to-survival/infra
export SWA_CLI_DEPLOYMENT_TOKEN=$(terraform output -raw static_web_app_api_key)
cd ../client
npx @azure/static-web-apps-cli deploy ./dist --env production
unset SWA_CLI_DEPLOYMENT_TOKEN
```

`--deployment-token -` (piping the token via stdin) is documented but was rejected
as invalid by CLI v2.0.10 (`deployment_token provided was invalid`) — use the
`SWA_CLI_DEPLOYMENT_TOKEN` env var instead. Also pass `--env production` explicitly:
the CLI defaults to `preview`, which is not what you want for the live site.

## Redeploying the server later

Rebuilding and pushing the same `:latest` tag is not enough on its own —
`terraform apply` sees no diff on an unchanged image string and won't roll a new
revision, and `az containerapp update --image ...` with the same tag gets deduped
by Container Apps for the same reason. Force a new revision explicitly:

```bash
az containerapp update -n rts-server -g rg-road-to-survival \
  --image <login_server>/road-to-survival-server:latest \
  --revision-suffix "redeploy$(date +%Y%m%d%H%M%S)"
```

Then confirm it's active and healthy:

```bash
az containerapp revision list -n rts-server -g rg-road-to-survival \
  --query "[].{name:name, active:properties.active, trafficWeight:properties.trafficWeight}" -o table
curl https://<container_app_fqdn>/health   # give it ~20-30s if it just scaled from zero
```

## Cost

No fixed Azure Postgres cost (Neon is free-tier, external). The only guaranteed fixed
monthly cost is the Container Registry (Basic SKU, ~$5/mo); Container Apps and Static
Web Apps both target near-zero idle cost via scale-to-zero / the Free tier. Log
Analytics (required by the Container Apps environment) is usage-based with no fixed
fee, negligible at this project's log volume.
