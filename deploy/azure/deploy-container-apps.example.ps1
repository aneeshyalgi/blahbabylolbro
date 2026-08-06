./deploy/azure/deploy-container-apps.ps1 `
  -SubscriptionId "00000000-0000-0000-0000-000000000000" `
  -ResourceGroup "rg-ecv-rwa-primary-dev-weu" `
  -Location "westus2" `
  -ContainerAppEnvName "cae-rwa-dev-westus2" `
  -AcrName "acrrawd01" `
  -BackendAppName "rwa-backend-dev" `
  -FrontendAppName "rwa-frontend-dev" `
  -KeyVaultName "ecvwarwadev01"
