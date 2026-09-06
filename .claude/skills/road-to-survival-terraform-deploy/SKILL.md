---
name: road-to-survival-terraform-deploy
description: Run/reapply the road-to-survival Azure Terraform (games/road-to-survival/infra) — init, plan, apply, push the server image, apply Neon migrations, deploy the client. Use whenever asked to deploy, redeploy, or update the road-to-survival Azure infrastructure.
---

# road-to-survival Terraform deploy

Full context: `openspec/changes/road-to-survival-azure-infra/design.md` and
`games/road-to-survival/infra/README.md`. This skill is the condensed runbook.

**Secrets stay out of this assistant's hands.** The Neon connection string and any
Azure auth must live only in the terminal you run these commands in — never paste
them into chat, never write them to a tracked file. All paths below are relative to
the repo root unless noted.

## 0. Prerequisites (once per shell session)

```bash
az login                          # must land on subscription 6c001a0e-0d97-406c-9d7c-4a19a844e1f9
az account show --query id -o tsv # confirm
export TF_VAR_neon_database_url="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
```

If you don't have a Neon project yet: create one at https://neon.tech (free tier,
default autosuspend), make a dedicated role for the server (not the account owner's
default role), and use that role's connection string above.

**If Claude Code is driving this session:** its Bash tool restores a shell snapshot
taken when the session started, not a fresh shell each call — so if the user adds
`export TF_VAR_neon_database_url=...` to `~/.zshrc` (or similar) *after* the session
began, it will not show up in the tool's env even though it's in the profile. Any
command that needs the var must `source ~/.zshrc` (or equivalent) in the same Bash
call. Check whether it's actually loaded with `[ -n "$TF_VAR_neon_database_url" ] &&
echo set || echo "not set"` — never `cat`/Read the profile itself to check, since
that dumps every secret in the file (this one included) straight into the
conversation.

## 1. First apply (placeholder image)

```bash
cd games/road-to-survival/infra
[ -f terraform.tfvars ] || cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

This creates everything — resource group, ACR, Container Apps environment/app (running
a public placeholder image), Static Web App — with `use_acr_registry = false`, since
the `AcrPull` role assignment the real image needs doesn't exist until after this apply.

## 2. Build and push the real server image

```bash
cd games/road-to-survival/infra
LOGIN_SERVER=$(terraform output -raw container_registry_login_server)
cd ..
az acr login --name "${LOGIN_SERVER%%.*}"
docker build --platform linux/amd64 -f server/Dockerfile -t "$LOGIN_SERVER/road-to-survival-server:latest" .
docker push "$LOGIN_SERVER/road-to-survival-server:latest"
```

**`--platform linux/amd64` is required on Apple Silicon (and any arm64) machines.**
Container Apps only runs linux/amd64. Without the flag, `docker build` defaults to
the host architecture, the push succeeds, and the revision *looks* healthy in
`az containerapp revision list` right up until the container fails at startup with
`/usr/local/bin/docker-entrypoint.sh: exec format error` (visible via `az
containerapp logs show`). Before pushing, sanity-check with:

```bash
docker inspect "$LOGIN_SERVER/road-to-survival-server:latest" --format '{{.Architecture}}/{{.Os}}'
# must print: amd64/linux
```

## 3. Second apply (switch to the real image)

Edit `games/road-to-survival/infra/terraform.tfvars`:

```hcl
container_image  = "<LOGIN_SERVER>/road-to-survival-server:latest"
use_acr_registry = true
```

```bash
cd games/road-to-survival/infra
terraform apply
```

## 4. Apply Prisma migrations against Neon

```bash
cd games/road-to-survival/server
DATABASE_URL="$TF_VAR_neon_database_url" npx prisma migrate deploy
```

## 5. Build and deploy the client

```bash
cd games/road-to-survival/infra
FQDN=$(terraform output -raw container_app_fqdn)
cd ..
VITE_SERVER_URL="wss://$FQDN" npm run build --workspace=client
```

**Must be `wss://`, not `ws://`** — the client is served over HTTPS from Static Web
Apps; browsers block insecure WebSocket connections from an HTTPS page.

```bash
cd games/road-to-survival/infra
export SWA_CLI_DEPLOYMENT_TOKEN=$(terraform output -raw static_web_app_api_key)
cd ../client
npx @azure/static-web-apps-cli deploy ./dist --env production
unset SWA_CLI_DEPLOYMENT_TOKEN
```

`--deployment-token -` (piping the token via stdin) is documented but was rejected
as invalid by CLI v2.0.10 (`deployment_token provided was invalid`) — use the
`SWA_CLI_DEPLOYMENT_TOKEN` env var instead, which is the CLI's other documented
form and actually works. Also pass `--env production` explicitly: the CLI defaults
to `preview`, which is not what you want for the live site.

## 6. Verify

- `curl https://<container_app_fqdn>/health` → `{"ok":true,...}`
- Open the Static Web App's default hostname, create/join a room, confirm it connects.
- Optional: let the Container App idle a few minutes, reconnect, confirm it cold-starts
  back up (this is expected — see spec's "Server Compute Scales to Zero When Idle").

## Redeploying later (code changed, infra unchanged)

Just repeat steps 2 and 3 (rebuild/push the image, `terraform apply` to roll the
revision) or step 5 (rebuild/redeploy the client). Skip step 1 — the infrastructure
already exists.

**`terraform apply` alone will not roll a new revision** if `container_image` is
still `...:latest` — the string is byte-identical to what's already in state, so
Terraform sees no diff (`0 to add, 0 to change` for the container app, or only the
unrelated `database-url` secret block touched). `az containerapp update --image
...` with the same tag doesn't help either — Container Apps dedupes on identical
template content and keeps the old revision active. Force a new one explicitly:

```bash
az containerapp update -n rts-server -g rg-road-to-survival \
  --image "$LOGIN_SERVER/road-to-survival-server:latest" \
  --revision-suffix "redeploy$(date +%Y%m%d%H%M%S)"
```

Then confirm the new revision is the one actually serving traffic and is healthy:

```bash
az containerapp revision list -n rts-server -g rg-road-to-survival \
  --query "[].{name:name, active:properties.active, trafficWeight:properties.trafficWeight}" -o table
curl https://<container_app_fqdn>/health   # give it ~20-30s if it just scaled from zero
```

## Tearing down

```bash
cd games/road-to-survival/infra
terraform destroy
```

Neon's project/database is separate and won't be touched — delete it manually via the
Neon console if you want to remove it too.
