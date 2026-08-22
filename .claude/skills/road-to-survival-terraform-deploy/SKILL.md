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
docker build -f server/Dockerfile -t "$LOGIN_SERVER/road-to-survival-server:latest" .
docker push "$LOGIN_SERVER/road-to-survival-server:latest"
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
terraform output -raw static_web_app_api_key | \
  npx @azure/static-web-apps-cli deploy ../client/dist --deployment-token -
```

## 6. Verify

- `curl https://<container_app_fqdn>/health` → `{"ok":true,...}`
- Open the Static Web App's default hostname, create/join a room, confirm it connects.
- Optional: let the Container App idle a few minutes, reconnect, confirm it cold-starts
  back up (this is expected — see spec's "Server Compute Scales to Zero When Idle").

## Redeploying later (code changed, infra unchanged)

Just repeat steps 2 and 3 (rebuild/push the image, `terraform apply` to roll the
revision) or step 5 (rebuild/redeploy the client). Skip step 1 — the infrastructure
already exists.

## Tearing down

```bash
cd games/road-to-survival/infra
terraform destroy
```

Neon's project/database is separate and won't be touched — delete it manually via the
Neon console if you want to remove it too.
