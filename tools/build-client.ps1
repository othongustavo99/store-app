[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Config,
    [ValidateSet('debug', 'release')][string]$Mode = 'debug',
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
$clientProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$clientConfigFile = (Resolve-Path -LiteralPath $Config).Path
$clientPreviousLocation = Get-Location
$clientPreviousEnv = @{}
$clientEnvNames = @('ORG_GRADLE_PROJECT_LOJA_APPLICATION_ID', 'ORG_GRADLE_PROJECT_LOJA_DISPLAY_NAME',
    'ORG_GRADLE_PROJECT_LOJA_USE_FIREBASE', 'ORG_GRADLE_PROJECT_LOJA_REQUIRE_RELEASE_SIGNING')
foreach ($clientEnvName in $clientEnvNames) {
    $clientPreviousEnv[$clientEnvName] = [Environment]::GetEnvironmentVariable($clientEnvName, 'Process')
}
try {
    Set-Location -LiteralPath $clientProjectRoot
    $clientPrepareScript = Join-Path $clientProjectRoot 'backend\dist\scripts\prepare_client.js'
    if (!(Test-Path -LiteralPath $clientPrepareScript)) { throw 'Compile o backend primeiro: cd backend; npm run build.' }
    & node $clientPrepareScript "--config=$clientConfigFile"
    if ($LASTEXITCODE -ne 0) { throw 'Configuração por cliente inválida. Nenhum build foi iniciado.' }
    $clientConfiguration = Get-Content -LiteralPath $clientConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $clientOutput = Join-Path $clientProjectRoot ".client-builds\$($clientConfiguration.store.slug)-$($clientConfiguration.app.environment)"
    $clientPlan = Get-Content -LiteralPath (Join-Path $clientOutput 'android.plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $clientDefines = Join-Path $clientOutput 'flutter.defines.json'
    Write-Output "Loja: $($clientPlan.store.slug) | Ambiente: $($clientPlan.store.environment) | Android: $($clientPlan.android.applicationId)"
    Write-Output "Nome instalado: $($clientPlan.android.displayName) | Modo do APK: $Mode"
    if (!$Build) {
        Write-Output 'Plano preparado. Revise os arquivos gerados; use -Build para compilar. Nenhum APK foi gerado.'
        return
    }
    if ($clientPlan.android.requireReleaseSigning -and $Mode -ne 'release') {
        throw 'Configuração de produção exige -Mode release e assinatura própria; use ambiente homologacao para testes.'
    }
    if ($clientPlan.android.requireReleaseSigning -and !(Test-Path -LiteralPath 'android\key.properties')) {
        throw 'Configure sua assinatura em android/key.properties antes do build de produção.'
    }
    [Environment]::SetEnvironmentVariable($clientEnvNames[0], $clientPlan.android.applicationId, 'Process')
    [Environment]::SetEnvironmentVariable($clientEnvNames[1], $clientPlan.android.displayName, 'Process')
    [Environment]::SetEnvironmentVariable($clientEnvNames[2], "$($clientPlan.android.useFirebase)".ToLowerInvariant(), 'Process')
    [Environment]::SetEnvironmentVariable($clientEnvNames[3], "$($clientPlan.android.requireReleaseSigning)".ToLowerInvariant(), 'Process')
    & flutter build apk "--$Mode" "--dart-define-from-file=$clientDefines"
    if ($LASTEXITCODE -ne 0) { throw 'Flutter informou falha. O APK anterior não foi copiado como nova entrega.' }
    $clientBuiltApk = Join-Path $clientProjectRoot "build\app\outputs\flutter-apk\app-$Mode.apk"
    if (!(Test-Path -LiteralPath $clientBuiltApk)) { throw 'Flutter terminou sem o APK esperado.' }
    $clientDeliveryApk = Join-Path $clientOutput "$($clientPlan.store.slug)-$($clientPlan.store.environment)-$Mode.apk"
    Copy-Item -LiteralPath $clientBuiltApk -Destination $clientDeliveryApk
    $clientReceipt = [ordered]@{
        storeId = $clientPlan.store.id; slug = $clientPlan.store.slug; environment = $clientPlan.store.environment
        applicationId = $clientPlan.android.applicationId; displayName = $clientPlan.android.displayName
        buildMode = $Mode; createdAtUtc = [DateTime]::UtcNow.ToString('o')
        definesSha256 = (Get-FileHash -LiteralPath $clientDefines -Algorithm SHA256).Hash
        apkSha256 = (Get-FileHash -LiteralPath $clientDeliveryApk -Algorithm SHA256).Hash
    }
    $clientReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $clientOutput "build-$Mode.receipt.json") -Encoding UTF8
    Write-Output "APK gerado: $clientDeliveryApk"
} finally {
    foreach ($clientEnvName in $clientEnvNames) {
        [Environment]::SetEnvironmentVariable($clientEnvName, $clientPreviousEnv[$clientEnvName], 'Process')
    }
    Set-Location -LiteralPath $clientPreviousLocation.Path
}
