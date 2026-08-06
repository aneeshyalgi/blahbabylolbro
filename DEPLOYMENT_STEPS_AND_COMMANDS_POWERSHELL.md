# RWA Deployment Steps and Commands (Windows PowerShell)

This document captures the end-to-end deployment flow for this project using **Windows PowerShell** commands.

This file now includes:
- The original deployment flow for the existing environment.
- A required access/RBAC precheck to avoid `AuthorizationFailed` surprises.
- A complete fresh-environment deployment path in case existing RG access is blocked.

## Scope

- Platform: Azure Container Apps
- Backend: FastAPI container
- Frontend: Next.js container
- Registry: Azure Container Registry (ACR)
- Storage: Azure Files mounted at `/data` for backend persistence
- Final state: **No auth gateway** (direct public frontend + backend)

## Environment Used

```powershell
$SUB = "e0db64fe-3e02-4b8c-a6d8-8564307f4043"
$RG = "rg-rwa-dev-westus2"
$LOC = "westus2"

$ACR_NAME = "acrrwac3e355"
$ACR_LOGIN_SERVER = "acrrwac3e355.azurecr.io"

$CAE_NAME = "cae-rwa-dev-westus2"
$BACKEND_APP = "rwa-backend-dev"
$FRONTEND_APP = "rwa-frontend-dev"

$BACKEND_REPO = "rwa-backend"
$FRONTEND_REPO = "rwa-frontend"
```

## 0. Access Prerequisites (Run First)

If your preflight fails with `AuthorizationFailed`, stop and fix access first.

### 0.1 Login and subscription selection

```powershell
az logout
az login --tenant 5b973f99-77df-4beb-b27d-aa0c70b8482c

# List all subscriptions you can access
az account list --all --query "[].{Name:name,Id:id,Tenant:tenantId,State:state,Default:isDefault}" -o table

# IMPORTANT: Set this to the subscription ID you selected in az login.
# Example if you selected option 2:
# $SUB = "14b6c83e-3545-4d7f-8084-041696bf3021"

# Set the subscription you plan to deploy into
az account set --subscription $SUB
az account show --query "{name:name,id:id,tenant:tenantId,user:user.name}" -o table

# Optional guardrail: verify your variable and active subscription are aligned.
$ACTIVE_SUB = (az account show --query id -o tsv).Trim()
"Active: $ACTIVE_SUB | Variable: $SUB"
```

### 0.2 RBAC check for target RG + ACR

```powershell
az group show -n $RG --subscription $SUB --query "{name:name,location:location}" -o table
az acr show -n $ACR_NAME -g $RG --subscription $SUB --query "{name:name,loginServer:loginServer}" -o table
```

If these fail with `AuthorizationFailed`, ask admin to grant:

- `Contributor` on `/subscriptions/<sub-id>/resourceGroups/<rg-name>`
- `AcrPush` on `/subscriptions/<sub-id>/resourceGroups/<rg-name>/providers/Microsoft.ContainerRegistry/registries/<acr-name>`

After role assignment, refresh login:

```powershell
az account clear
az login --tenant 5b973f99-77df-4beb-b27d-aa0c70b8482c
az account set --subscription $SUB
```

## 1. Preflight / Discovery

### 1.1 Verify account and resources

```powershell
az account set --subscription $SUB
az account show --query "{name:name,id:id,tenant:tenantId}" -o table
az group show -n $RG --query "{name:name,location:location}" -o table
az acr show -n $ACR_NAME -g $RG --query "{name:name,loginServer:loginServer}" -o table
```

### 1.2 Verify existing container apps

```powershell
az containerapp show -n $BACKEND_APP -g $RG --query "{name:name,fqdn:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external,targetPort:properties.configuration.ingress.targetPort}" -o json

az containerapp show -n $FRONTEND_APP -g $RG --query "{name:name,fqdn:properties.configuration.ingress.fqdn,external:properties.configuration.ingress.external,targetPort:properties.configuration.ingress.targetPort}" -o json
```

## 2. Backend Deployment (Initial)

### 2.1 Build backend image in ACR

```powershell
$TAG = "backend-v1"
az acr build `
  -r $ACR_NAME `
  -t "$BACKEND_REPO:$TAG" `
  -f backend/Dockerfile `
  backend
```

### 2.2 Create backend app (without volume first)

```powershell
az containerapp create `
  -n $BACKEND_APP `
  -g $RG `
  --environment $CAE_NAME `
  --ingress external `
  --target-port 8000 `
  --min-replicas 1 `
  --max-replicas 1 `
  --image "$ACR_LOGIN_SERVER/$BACKEND_REPO:$TAG" `
  --registry-server $ACR_LOGIN_SERVER `
  --secrets aoai-api-key="<set-secret-value-here>" `
  --env-vars `
    APP_DATA_ROOT=/data `
    DATASETS_DIR=/data/uploads/datasets `
    CODE_DIR=/data/uploads/code `
    RESULTS_DIR=/data/results `
    RWA_DATABASE_PATH=/data/rwa_data.db `
    BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" `
    AZURE_OPENAI_API_VERSION="2024-10-21" `
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o" `
    AZURE_OPENAI_USE_BASE_URL="true" `
    AZURE_OPENAI_ENDPOINT="https://eyq-incubator.europe.fabric.ey.com/eyq/eu/api" `
    AZURE_OPENAI_API_KEY=secretref:aoai-api-key
```

### 2.3 Backend smoke test

```powershell
$BACKEND_FQDN = (az containerapp show -n $BACKEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim()
Invoke-RestMethod -Uri "https://$BACKEND_FQDN/"
Invoke-RestMethod -Uri "https://$BACKEND_FQDN/api/datasets"
```

## 3. Add Azure Files Volume Mount to Backend

`az containerapp create` options for volume/mount were limited in this environment, so mount was applied through ARM REST patch.

### 3.1 Patch payload (example)

```powershell
$PatchFile = Join-Path $env:TEMP "add_volume.json"
@'
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
'@ | Set-Content -Path $PatchFile -Encoding UTF8
```

### 3.2 Apply patch

```powershell
$API_VER = "2024-03-01"
$RESOURCE_URI = "https://management.azure.com/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.App/containerApps/$BACKEND_APP?api-version=$API_VER"

az rest `
  --method PATCH `
  --uri $RESOURCE_URI `
  --body "@$PatchFile" `
  --headers "Content-Type=application/json"
```

## 4. Frontend Deployment

### 4.1 Build frontend image with backend URL

```powershell
$BACKEND_URL = "https://$((az containerapp show -n $BACKEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim())"
$TAG = "frontend-v1"

az acr build `
  -r $ACR_NAME `
  -t "$FRONTEND_REPO:$TAG" `
  -f frontend/Dockerfile `
  --build-arg "NEXT_PUBLIC_API_URL=$BACKEND_URL" `
  frontend
```

### 4.2 Deploy/update frontend app

```powershell
az containerapp create `
  -n $FRONTEND_APP `
  -g $RG `
  --environment $CAE_NAME `
  --ingress external `
  --target-port 3000 `
  --min-replicas 1 `
  --max-replicas 2 `
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG" `
  --registry-server $ACR_LOGIN_SERVER

# or update existing app image
az containerapp update `
  -n $FRONTEND_APP `
  -g $RG `
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG"
```

### 4.3 Update backend CORS for deployed frontend URL

```powershell
$FRONTEND_URL = "https://$((az containerapp show -n $FRONTEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim())"

az containerapp update `
  -n $BACKEND_APP `
  -g $RG `
  --set-env-vars "BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,$FRONTEND_URL"
```

## 5. Troubleshooting Upload Failure (`database is locked`)

Observed in backend logs:

```powershell
az containerapp logs show -n $BACKEND_APP -g $RG --tail 200
```

Error seen: `sqlite3.OperationalError: database is locked`

### 5.1 Recovery path used

1. Delete backend app.
2. Remove stale DB file from mounted share.
3. Redeploy backend **without** mount first.
4. Wait until API responds.
5. Re-apply mount via `az rest PATCH`.

### 5.2 Commands

```powershell
az containerapp delete -n $BACKEND_APP -g $RG --yes

# Delete DB file in Azure Files (via mounted endpoint/tooling used during session)
# Then redeploy backend (same as section 2.2)

$BACKEND_FQDN = (az containerapp show -n $BACKEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim()
Invoke-RestMethod -Uri "https://$BACKEND_FQDN/"
Invoke-RestMethod -Uri "https://$BACKEND_FQDN/api/datasets"

# Re-apply volume mount patch (section 3.2)
```

## 6. Auth Gateway Experiment (Later Reverted)

A separate `auth-gateway` was created and deployed with Entra auth, then changed to multi-tenant and domain allowlist.

Later, per request, the entire auth setup was removed.

## 7. Full Auth Rollback (Final)

### 7.1 Remove auth resources

```powershell
az containerapp delete -n rwa-gateway-dev -g $RG --yes
az ad app delete --id "f14fd59c-ff6f-42c4-9713-e47a5d84fd45"
```

### 7.2 Restore public ingress for backend/frontend

```powershell
az containerapp ingress update -n $BACKEND_APP -g $RG --type external --target-port 8000
az containerapp ingress update -n $FRONTEND_APP -g $RG --type external --target-port 3000
```

### 7.3 Rebuild frontend to point back to backend directly

```powershell
$TAG = Get-Date -Format "yyyyMMdd-HHmmss"
az acr build `
  -r $ACR_NAME `
  -t "$FRONTEND_REPO:$TAG" `
  -f frontend/Dockerfile `
  --build-arg "NEXT_PUBLIC_API_URL=https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io" `
  frontend

az containerapp update `
  -n $FRONTEND_APP `
  -g $RG `
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG"
```

### 7.4 Restore CORS to direct frontend URL

```powershell
az containerapp update `
  -n $BACKEND_APP `
  -g $RG `
  --set-env-vars "BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io"
```

## 8. Final Validation Commands (Current)

```powershell
$frontendUrl = "https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/"
$backendUrl = "https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/"
$datasetsUrl = "https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io/api/datasets"

$urls = @($frontendUrl, $backendUrl, $datasetsUrl)
foreach ($url in $urls) {
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Get
    $resp.StatusCode
  }
  catch {
    if ($_.Exception.Response) {
      [int]$_.Exception.Response.StatusCode
    }
    else {
      Write-Host "Request failed: $url"
      throw
    }
  }
}
```

Expected: `200`, `200`, `200`.

## 9. Active URLs (No Auth)

- Frontend: `https://rwa-frontend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io`
- Backend: `https://rwa-backend-dev.salmonmushroom-d676e1c0.westus2.azurecontainerapps.io`

## 10. Notes

- Secrets are intentionally omitted from this file; use Key Vault/Container App secrets.
- If you change backend and frontend frequently, redeploy backend first, then frontend with updated `NEXT_PUBLIC_API_URL`.
- If SQLite locking appears again with mounted storage, use the same recover-first-without-mount, then patch-mount flow.

## 11. Fresh Deployment Path (New RG, New Containers)

Use this path if you do not have access to the original RG/subscription but can deploy in another subscription.

### 11.1 Set fresh names

```powershell
# Example subscription where you currently have access
$SUB = "14b6c83e-3545-4d7f-8084-041696bf3021"
$LOC = "westus2"

$STAMP = Get-Date -Format "yyMMddHHmm"

$RG = "rg-rwa-fresh-$STAMP"
$ACR_NAME = ("acrrwa" + $STAMP).ToLower()
$CAE_NAME = "cae-rwa-fresh-$STAMP"
$BACKEND_APP = "rwa-backend-fresh-$STAMP"
$FRONTEND_APP = "rwa-frontend-fresh-$STAMP"

$BACKEND_REPO = "rwa-backend"
$FRONTEND_REPO = "rwa-frontend"
```

### 11.2 Login and set subscription

```powershell
az login --tenant 5b973f99-77df-4beb-b27d-aa0c70b8482c
az account set --subscription $SUB
az account show --query "{name:name,id:id,tenant:tenantId,user:user.name}" -o table
```

### 11.3 Create resource group, ACR, and Container Apps environment

```powershell
az group create -n $RG -l $LOC --subscription $SUB

az acr create `
  -n $ACR_NAME `
  -g $RG `
  --sku Basic `
  --admin-enabled true

az containerapp env create `
  -n $CAE_NAME `
  -g $RG `
  -l $LOC
```

### 11.4 Build and deploy backend

```powershell
$ACR_LOGIN_SERVER = (az acr show -n $ACR_NAME -g $RG --query loginServer -o tsv).Trim()
$TAG = Get-Date -Format "yyyyMMdd-HHmmss"

az acr build `
  -r $ACR_NAME `
  -t "$BACKEND_REPO:$TAG" `
  -f backend/Dockerfile `
  backend

az containerapp create `
  -n $BACKEND_APP `
  -g $RG `
  --environment $CAE_NAME `
  --ingress external `
  --target-port 8000 `
  --min-replicas 1 `
  --max-replicas 1 `
  --image "$ACR_LOGIN_SERVER/$BACKEND_REPO:$TAG" `
  --registry-server $ACR_LOGIN_SERVER `
  --secrets aoai-api-key="<set-secret-value-here>" `
  --env-vars `
    APP_DATA_ROOT=/data `
    DATASETS_DIR=/data/uploads/datasets `
    CODE_DIR=/data/uploads/code `
    RESULTS_DIR=/data/results `
    RWA_DATABASE_PATH=/data/rwa_data.db `
    BACKEND_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" `
    AZURE_OPENAI_API_VERSION="2024-10-21" `
    AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o" `
    AZURE_OPENAI_USE_BASE_URL="true" `
    AZURE_OPENAI_ENDPOINT="https://eyq-incubator.europe.fabric.ey.com/eyq/eu/api" `
    AZURE_OPENAI_API_KEY=secretref:aoai-api-key
```

### 11.5 Build and deploy frontend against the new backend

```powershell
$BACKEND_FQDN = (az containerapp show -n $BACKEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim()
$BACKEND_URL = "https://$BACKEND_FQDN"
$TAG2 = Get-Date -Format "yyyyMMdd-HHmmss"

az acr build `
  -r $ACR_NAME `
  -t "$FRONTEND_REPO:$TAG2" `
  -f frontend/Dockerfile `
  --build-arg "NEXT_PUBLIC_API_URL=$BACKEND_URL" `
  frontend

az containerapp create `
  -n $FRONTEND_APP `
  -g $RG `
  --environment $CAE_NAME `
  --ingress external `
  --target-port 3000 `
  --min-replicas 1 `
  --max-replicas 2 `
  --image "$ACR_LOGIN_SERVER/$FRONTEND_REPO:$TAG2" `
  --registry-server $ACR_LOGIN_SERVER
```

### 11.6 Update backend CORS to include new frontend URL

```powershell
$FRONTEND_FQDN = (az containerapp show -n $FRONTEND_APP -g $RG --query properties.configuration.ingress.fqdn -o tsv).Trim()
$FRONTEND_URL = "https://$FRONTEND_FQDN"

az containerapp update `
  -n $BACKEND_APP `
  -g $RG `
  --set-env-vars "BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,$FRONTEND_URL"
```

### 11.7 Validate fresh environment

```powershell
Invoke-WebRequest -Uri "https://$FRONTEND_FQDN/" -Method Get | Select-Object StatusCode
Invoke-WebRequest -Uri "https://$BACKEND_FQDN/" -Method Get | Select-Object StatusCode
Invoke-WebRequest -Uri "https://$BACKEND_FQDN/api/datasets" -Method Get | Select-Object StatusCode
```

Expected status for all: `200`.
