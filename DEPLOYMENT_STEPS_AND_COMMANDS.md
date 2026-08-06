# RWA Deployment Steps and Commands (Session Log)

This document captures the end-to-end deployment flow used for this project, including troubleshooting and the final rollback to a no-auth setup.

## Scope

- Platform: Azure Container Apps
- Backend: FastAPI container
- Frontend: Next.js container
- Registry: Azure Container Registry (ACR)
- Storage: Azure Files mounted at `/data` for backend persistence
- Final state: **No auth gateway** (direct public frontend + backend)

## Environment Used

```bash
SUB="95d9bb5b-4111-407d-9ef1-a0ada1962b0b"
RG="rg-rwa-dev-westus2"
LOC="westus2"

ACR_NAME="acrrwac3e355"
ACR_LOGIN_SERVER="acrrwac3e355.azurecr.io"

CAE_NAME="cae-rwa-dev-westus2"
BACKEND_APP="rwa-backend-dev"
FRONTEND_APP="rwa-frontend-dev"

BACKEND_REPO="rwa-backend"
FRONTEND_REPO="rwa-frontend"
```

## 1. Preflight / Discovery

### 1.1 Verify account and resources

```bash
az account set --subscription "$SUB"
az account show --query "{name:name,id:id,tenant:tenantId}" -o table
az group show -n "$RG" --query "{name:name,location:location}" -o table
az acr show -n "$ACR_NAME" -g "$RG" --query "{name:name,loginServer:loginServer}" -o table
```

### 1.2 Verify existing container apps

```bash
az containerapp show -n "$BACKEND_APP" -g "$RG" --query "{name:name,fqdn:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external,targetPort:properties.configuration.ingress.targetPort}" -o json

az containerapp show -n "$FRONTEND_APP" -g "$RG" --query "{name:name,fqdn:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external,targetPort:properties.configuration.ingress.targetPort}" -o json
```

## 2. Backend Deployment (Initial)

### 2.1 Build backend image in ACR

```bash
TAG="backend-v1"
az acr build \
  -r "$ACR_NAME" \
  -t "$BACKEND_REPO:$TAG" \
  -f backend/Dockerfile \
  backend
```

### 2.2 Create backend app (without volume first)

```bash
az containerapp create \
  -n "$BACKEND_APP" \
  -g "$RG" \
  --environment "$CAE_NAME" \
  --ingress external \
  --target-port 8000 \
  --min-replicas 1 \
  --max-replicas 1 \
  --image "$ACR_LOGIN_SERVER/$BACKEND_REPO:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --secrets aoai-api-key="<set-secret-value-here>" \
  --env-vars \
    APP_DATA_ROOT=/data \
    DATASETS_DIR=/data/uploads/datasets \
    CODE_DIR=/data/uploads/code \
    RESULTS_DIR=/data/results \
    RWA_DATABASE_PATH=/data/rwa_data.db \
    BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
    AZURE_OPENAI_API_VERSION="2024-10-21" \
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o" \
    AZURE_OPENAI_USE_BASE_URL="true" \
    AZURE_OPENAI_ENDPOINT="https://eyq-incubator.europe.fabric.ey.com/eyq/eu/api" \
    AZURE_OPENAI_API_KEY=secretref:aoai-api-key
```

### 2.3 Backend smoke test

```bash
BACKEND_FQDN="$(az containerapp show -n "$BACKEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
curl -s "https://$BACKEND_FQDN/"
curl -s "https://$BACKEND_FQDN/api/datasets"
```

## 3. Add Azure Files Volume Mount to Backend

`az containerapp create` options for volume/mount were limited in this environment, so mount was applied through ARM REST patch.

### 3.1 Patch payload (example)

```json
{
  "properties": {
    "template": {
      "containers": [
        {
          "name": "rwa-backend-dev",
          "volumeMounts": [
            {
              "volumeName": "data-vol",
              "mountPath": "/data"
            }
          ]
        }
      ],
      "volumes": [
        {
          "name": "data-vol",
          "storageType": "AzureFile",
          "storageName": "rwastorage"
        }
      ]
    }
  }
}
```

### 3.2 Apply patch

```bash
API_VER="2024-03-01"
RESOURCE_URI="https://management.azure.com/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.App/containerApps/${BACKEND_APP}?api-version=${API_VER}"

az rest \
  --method PATCH \
  --uri "$RESOURCE_URI" \
  --body @/tmp/add_volume.json \
  --headers "Content-Type=application/json"
```

## 4. Frontend Deployment

### 4.1 Build frontend image with backend URL

```bash
BACKEND_URL="https://$(az containerapp show -n "$BACKEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"
TAG="frontend-v1"

az acr build \
  -r "$ACR_NAME" \
  -t "$FRONTEND_REPO:$TAG" \
  -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="$BACKEND_URL" \
  frontend
```

### 4.2 Deploy/update frontend app

```bash
az containerapp create \
  -n "$FRONTEND_APP" \
  -g "$RG" \
  --environment "$CAE_NAME" \
  --ingress external \
  --target-port 3000 \
  --min-replicas 1 \
  --max-replicas 2 \
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER"

# or update existing app image
az containerapp update \
  -n "$FRONTEND_APP" \
  -g "$RG" \
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG"
```

### 4.3 Update backend CORS for deployed frontend URL

```bash
FRONTEND_URL="https://$(az containerapp show -n "$FRONTEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)"

az containerapp update \
  -n "$BACKEND_APP" \
  -g "$RG" \
  --set-env-vars BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,$FRONTEND_URL"
```

## 5. Troubleshooting Upload Failure (`database is locked`)

Observed in backend logs:

```bash
az containerapp logs show -n "$BACKEND_APP" -g "$RG" --tail 200
```

Error seen: `sqlite3.OperationalError: database is locked`

### 5.1 Recovery path used

1. Delete backend app.
2. Remove stale DB file from mounted share.
3. Redeploy backend **without** mount first.
4. Wait until API responds.
5. Re-apply mount via `az rest PATCH`.

### 5.2 Commands

```bash
az containerapp delete -n "$BACKEND_APP" -g "$RG" --yes

# Delete DB file in Azure Files (via mounted endpoint/tooling used during session)
# Then redeploy backend (same as section 2.2)

curl -s "https://$(az containerapp show -n "$BACKEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)/"
curl -s "https://$(az containerapp show -n "$BACKEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)/api/datasets"

# Re-apply volume mount patch (section 3.2)
```

## 6. Auth Gateway Experiment (Later Reverted)

A separate `auth-gateway` was created and deployed with Entra auth, then changed to multi-tenant and domain allowlist.

Later, per request, the entire auth setup was removed.

## 7. Full Auth Rollback (Final)

### 7.1 Remove auth resources

```bash
az containerapp delete -n rwa-gateway-dev -g "$RG" --yes
az ad app delete --id "f14fd59c-ff6f-42c4-9713-e47a5d84fd45"
```

### 7.2 Restore public ingress for backend/frontend

```bash
az containerapp ingress update -n "$BACKEND_APP" -g "$RG" --type external --target-port 8000
az containerapp ingress update -n "$FRONTEND_APP" -g "$RG" --type external --target-port 3000
```

### 7.3 Rebuild frontend to point back to backend directly

```bash
TAG="$(date +%Y%m%d-%H%M%S)"
az acr build \
  -r "$ACR_NAME" \
  -t "$FRONTEND_REPO:$TAG" \
  -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL="https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io" \
  frontend

az containerapp update \
  -n "$FRONTEND_APP" \
  -g "$RG" \
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG"
```

### 7.4 Restore CORS to direct frontend URL

```bash
az containerapp update \
  -n "$BACKEND_APP" \
  -g "$RG" \
  --set-env-vars BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io"
```

## 8. Final Validation Commands (Current)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/
curl -s -o /dev/null -w "%{http_code}\n" https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/
curl -s -o /dev/null -w "%{http_code}\n" https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/api/datasets
```

Expected: `200`, `200`, `200`.

## 9. Active URLs (No Auth)

- Frontend: `https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io`
- Backend: `https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io`

## 10. Notes

- Secrets are intentionally omitted from this file; use Key Vault/Container App secrets.
- If you change backend and frontend frequently, redeploy backend first, then frontend with updated `NEXT_PUBLIC_API_URL`.
- If SQLite locking appears again with mounted storage, use the same recover-first-without-mount, then patch-mount flow.
