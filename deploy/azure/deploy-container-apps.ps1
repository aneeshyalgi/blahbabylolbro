param(
    [Parameter(Mandatory = $true)]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory = $true)]
    [string]$Location,

    [Parameter(Mandatory = $true)]
    [string]$ContainerAppEnvName,

    [Parameter(Mandatory = $true)]
    [string]$AcrName,

    [Parameter(Mandatory = $true)]
    [string]$BackendAppName,

    [Parameter(Mandatory = $true)]
    [string]$FrontendAppName,

    [Parameter(Mandatory = $true)]
    [string]$KeyVaultName,

    [string]$StorageAccountName = "",
    [string]$FileShareName = "rwadata",
    [string]$StorageMountName = "rwastorage",
    [string]$BackendImageTag = "backend-v1",
    [string]$FrontendImageTag = "frontend-v1",
    [string]$AoaiApiKeySecretName = "AZURE_OPENAI_API_KEY",
    [string]$AoaiEndpointSecretName = "AZURE_OPENAI_ENDPOINT",
    [string]$AoaiApiVersionSecretName = "AZURE_OPENAI_API_VERSION",
    [string]$AoaiDeploymentSecretName = "AZURE_OPENAI_DEPLOYMENT_NAME",
    [string]$AoaiUseBaseUrlSecretName = "AZURE_OPENAI_USE_BASE_URL",
    [string]$SessionSecretSecretName = "SESSION_SECRET",
    [string]$AdminUsernameSecretName = "ADMIN_USERNAME",
    [string]$AdminPasswordSecretName = "ADMIN_PASSWORD",
    [string]$BackendCorsOrigins = "",
    [int]$BackendMinReplicas = 1,
    [int]$BackendMaxReplicas = 1,
    [int]$FrontendMinReplicas = 1,
    [int]$FrontendMaxReplicas = 2
)

$ErrorActionPreference = "Stop"

function Run-Az {
    param([string]$Command)
    Write-Host ">>> az $Command" -ForegroundColor Cyan
    Invoke-Expression "az $Command"
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: az $Command"
    }
}

function Get-KvSecretValue {
    param(
        [string]$VaultName,
        [string]$SecretName,
        [bool]$Required = $true
    )

    $value = az keyvault secret show --vault-name $VaultName --name $SecretName --query value -o tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
        if ($Required) {
            throw "Required Key Vault secret '$SecretName' not found in vault '$VaultName'."
        }
        return ""
    }
    return $value
}

function Ensure-ContainerAppExtension {
    $extension = az extension show --name containerapp --query name -o tsv 2>$null
    if (-not $extension) {
        Run-Az "extension add --name containerapp --upgrade"
    }
}

function Ensure-ResourceGroup {
    param([string]$Name, [string]$RgLocation)
    $exists = az group exists --name $Name
    if ($exists -eq "false") {
        Run-Az "group create --name $Name --location $RgLocation"
    }
}

function Ensure-ContainerAppEnvironment {
    param([string]$Name, [string]$RG, [string]$EnvLocation)

    $envId = az containerapp env show --name $Name --resource-group $RG --query id -o tsv 2>$null
    if (-not $envId) {
        Run-Az "containerapp env create --name $Name --resource-group $RG --location $EnvLocation"
    }
}

function Ensure-Acr {
    param([string]$Name, [string]$RG, [string]$AcrLocation)

    $acrId = az acr show --name $Name --resource-group $RG --query id -o tsv 2>$null
    if (-not $acrId) {
        Run-Az "acr create --name $Name --resource-group $RG --location $AcrLocation --sku Standard"
    }
}

function Ensure-StorageAccount {
    param([string]$Name, [string]$RG, [string]$StLocation)

    $storageId = az storage account show --name $Name --resource-group $RG --query id -o tsv 2>$null
    if (-not $storageId) {
        Run-Az "storage account create --name $Name --resource-group $RG --location $StLocation --sku Standard_LRS --kind StorageV2"
    }
}

function Ensure-FileShare {
    param([string]$StorageName, [string]$RG, [string]$ShareName)

    $accountKey = az storage account keys list --account-name $StorageName --resource-group $RG --query "[0].value" -o tsv
    if (-not $accountKey) {
        throw "Could not retrieve storage account key for $StorageName"
    }

    $shareExists = az storage share exists --name $ShareName --account-name $StorageName --account-key $accountKey --query exists -o tsv
    if ($shareExists -ne "true") {
        Run-Az "storage share create --name $ShareName --account-name $StorageName --account-key $accountKey"
    }

    return $accountKey
}

function Ensure-EnvironmentStorageBinding {
    param(
        [string]$EnvName,
        [string]$RG,
        [string]$MountName,
        [string]$StorageName,
        [string]$ShareName,
        [string]$AccountKey
    )

    # Idempotent update for env storage binding
    Run-Az "containerapp env storage set --name $EnvName --resource-group $RG --storage-name $MountName --access-mode ReadWrite --azure-file-account-name $StorageName --azure-file-account-key $AccountKey --azure-file-share-name $ShareName"
}

function Build-And-Push-Backend {
    param([string]$Registry, [string]$Tag)

    Run-Az "acr build --registry $Registry --image rwa-backend:$Tag --file backend/Dockerfile backend"
}

function Build-And-Push-Frontend {
    param([string]$Registry, [string]$Tag, [string]$ApiUrl)

    Run-Az "acr build --registry $Registry --image rwa-frontend:$Tag --build-arg NEXT_PUBLIC_API_URL=$ApiUrl --file frontend/Dockerfile frontend"
}

Write-Host "Selecting subscription..." -ForegroundColor Yellow
Run-Az "account set --subscription $SubscriptionId"
Ensure-ContainerAppExtension
Ensure-ResourceGroup -Name $ResourceGroup -RgLocation $Location
Ensure-Acr -Name $AcrName -RG $ResourceGroup -AcrLocation $Location
Ensure-ContainerAppEnvironment -Name $ContainerAppEnvName -RG $ResourceGroup -EnvLocation $Location

$acrLoginServer = az acr show --name $AcrName --resource-group $ResourceGroup --query loginServer -o tsv
if (-not $acrLoginServer) {
    throw "Unable to resolve ACR login server for '$AcrName'."
}

if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
    $suffix = -join ((97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
    $StorageAccountName = ("rwa" + $suffix)
}

if ($StorageAccountName.Length -lt 3 -or $StorageAccountName.Length -gt 24) {
    throw "StorageAccountName must be between 3 and 24 characters."
}

Write-Host "Ensuring storage account and file share for persistent backend data..." -ForegroundColor Yellow
Ensure-StorageAccount -Name $StorageAccountName -RG $ResourceGroup -StLocation $Location
$storageKey = Ensure-FileShare -StorageName $StorageAccountName -RG $ResourceGroup -ShareName $FileShareName
Ensure-EnvironmentStorageBinding -EnvName $ContainerAppEnvName -RG $ResourceGroup -MountName $StorageMountName -StorageName $StorageAccountName -ShareName $FileShareName -AccountKey $storageKey

Write-Host "Reading Azure OpenAI secrets from Key Vault..." -ForegroundColor Yellow
$aoaiApiKey = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AoaiApiKeySecretName -Required $true
$aoaiEndpoint = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AoaiEndpointSecretName -Required $true
$aoaiApiVersion = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AoaiApiVersionSecretName -Required $false
$aoaiDeployment = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AoaiDeploymentSecretName -Required $false
$aoaiUseBaseUrl = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AoaiUseBaseUrlSecretName -Required $false
$sessionSecret = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $SessionSecretSecretName -Required $false
$adminUsername = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AdminUsernameSecretName -Required $false
$adminPassword = Get-KvSecretValue -VaultName $KeyVaultName -SecretName $AdminPasswordSecretName -Required $false

if ([string]::IsNullOrWhiteSpace($sessionSecret)) {
    $sessionSecret = [guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
    Write-Host "WARNING: Key Vault secret '$SessionSecretSecretName' not found. Using a generated SESSION_SECRET for this deployment; active sessions will be invalidated on the next redeploy unless you store a fixed value in Key Vault." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($adminUsername)) {
    $adminUsername = "admin"
    Write-Host "INFO: Key Vault secret '$AdminUsernameSecretName' not found. Defaulting ADMIN_USERNAME to 'admin'." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($adminPassword)) {
    $adminPassword = "ChangeMe123!"
    Write-Host "WARNING: Key Vault secret '$AdminPasswordSecretName' not found. Using default ADMIN_PASSWORD 'ChangeMe123!'. Change it before production use." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($aoaiApiVersion)) {
    $aoaiApiVersion = "2024-10-21"
}
if ([string]::IsNullOrWhiteSpace($aoaiDeployment)) {
    $aoaiDeployment = "gpt-4o"
}

if ([string]::IsNullOrWhiteSpace($BackendCorsOrigins)) {
    # Frontend URL gets appended after frontend is created.
    $BackendCorsOrigins = "http://localhost:3000,http://127.0.0.1:3000"
}

Write-Host "Building backend image in ACR..." -ForegroundColor Yellow
Build-And-Push-Backend -Registry $AcrName -Tag $BackendImageTag

$backendImage = "$acrLoginServer/rwa-backend:$BackendImageTag"
$frontendImage = "$acrLoginServer/rwa-frontend:$FrontendImageTag"

Write-Host "Deploying backend Container App..." -ForegroundColor Yellow
Run-Az "containerapp up --name $BackendAppName --resource-group $ResourceGroup --environment $ContainerAppEnvName --image $backendImage --target-port 8000 --ingress external --min-replicas $BackendMinReplicas --max-replicas $BackendMaxReplicas --registry-server $acrLoginServer --env-vars APP_DATA_ROOT=/data DATASETS_DIR=/data/uploads/datasets CODE_DIR=/data/uploads/code RESULTS_DIR=/data/results RWA_DATABASE_PATH=/data/rwa_data.db BACKEND_CORS_ORIGINS=$BackendCorsOrigins AZURE_OPENAI_API_VERSION=$aoaiApiVersion AZURE_OPENAI_DEPLOYMENT_NAME=$aoaiDeployment AZURE_OPENAI_USE_BASE_URL=$aoaiUseBaseUrl ADMIN_USERNAME=$adminUsername --secrets azure-openai-api-key=$aoaiApiKey azure-openai-endpoint=$aoaiEndpoint session-secret=$sessionSecret admin-password=$adminPassword --secret-env-vars AZURE_OPENAI_API_KEY=secretref:azure-openai-api-key AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint SESSION_SECRET=secretref:session-secret ADMIN_PASSWORD=secretref:admin-password --volume-mounts /data --volumes name=data,storageName=$StorageMountName,storageType=AzureFile"

$backendFqdn = az containerapp show --name $BackendAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
if (-not $backendFqdn) {
    throw "Could not resolve backend FQDN after deployment."
}
$backendUrl = "https://$backendFqdn"

Write-Host "Backend URL: $backendUrl" -ForegroundColor Green

Write-Host "Building frontend image with NEXT_PUBLIC_API_URL=$backendUrl ..." -ForegroundColor Yellow
Build-And-Push-Frontend -Registry $AcrName -Tag $FrontendImageTag -ApiUrl $backendUrl

Write-Host "Deploying frontend Container App..." -ForegroundColor Yellow
Run-Az "containerapp up --name $FrontendAppName --resource-group $ResourceGroup --environment $ContainerAppEnvName --image $frontendImage --target-port 3000 --ingress external --min-replicas $FrontendMinReplicas --max-replicas $FrontendMaxReplicas --registry-server $acrLoginServer"

$frontendFqdn = az containerapp show --name $FrontendAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$frontendUrl = "https://$frontendFqdn"

Write-Host "Updating backend CORS to include deployed frontend URL..." -ForegroundColor Yellow
$finalCors = "$BackendCorsOrigins,$frontendUrl"
Run-Az "containerapp update --name $BackendAppName --resource-group $ResourceGroup --set-env-vars BACKEND_CORS_ORIGINS=$finalCors"

Write-Host "" 
Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "Frontend URL: $frontendUrl" -ForegroundColor Green
Write-Host "Backend URL : $backendUrl" -ForegroundColor Green
Write-Host "Storage account: $StorageAccountName (share: $FileShareName)" -ForegroundColor Green
