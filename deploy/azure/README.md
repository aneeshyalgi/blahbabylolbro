# Azure Container Apps Deployment

This folder contains a deployment script for hosting the app on Azure Container Apps with:

- Separate frontend and backend Container Apps
- Azure Container Registry build/push
- Azure Files mount for backend persistence at `/data`
- Azure OpenAI secret injection from Key Vault
- Backend-first deployment so frontend is built with the correct API URL

## Prerequisites

- Azure CLI installed and authenticated (`az login`)
- Access to subscription/resource group and Key Vault
- Public IP access to Key Vault allowed (per InfoSec policy)

## Required Key Vault secrets

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`

Optional:

- `AZURE_OPENAI_API_VERSION` (defaults to `2024-10-21`)
- `AZURE_OPENAI_DEPLOYMENT_NAME` (defaults to `gpt-4o`)
- `AZURE_OPENAI_USE_BASE_URL` (optional)

## Run

From repository root:

```powershell
./deploy/azure/deploy-container-apps.ps1 `
  -SubscriptionId "<subscription-id>" `
  -ResourceGroup "<resource-group>" `
  -Location "westus2" `
  -ContainerAppEnvName "<container-app-env>" `
  -AcrName "<acr-name>" `
  -BackendAppName "<backend-app-name>" `
  -FrontendAppName "<frontend-app-name>" `
  -KeyVaultName "<key-vault-name>"
```

## Notes

- Backend defaults to single replica (`-BackendMinReplicas 1 -BackendMaxReplicas 1`) to avoid concurrency issues with SQLite.
- App data is persisted to Azure Files under `/data`.
- Frontend image is built with `NEXT_PUBLIC_API_URL` set to deployed backend URL.
