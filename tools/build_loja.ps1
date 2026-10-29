# P1 - Build Android por loja, sem criar/alterar credenciais do Mercado Pago.
# Exemplo: .\tools\build_loja.ps1 -BackendUrl 'https://api.up.railway.app' -StoreSlug 'vitrine-demo-f40' -AppName 'Vitrine Demo'
param(
  [Parameter(Mandatory=$true)][string]$BackendUrl,
  [Parameter(Mandatory=$true)][string]$StoreSlug,
  [Parameter(Mandatory=$true)][string]$AppName,
  [string]$ApplicationId='com.loja.roupas.loja_roupas',
  [string]$GoogleServicesJson=''
)
$ErrorActionPreference='Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($BackendUrl -notmatch '^https://[^/]+') { throw 'BackendUrl deve usar HTTPS.' }
if ($StoreSlug -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { throw 'StoreSlug invalido.' }
if ($ApplicationId -notmatch '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$') { throw 'ApplicationId invalido.' }
if ([string]::IsNullOrWhiteSpace($AppName)) { throw 'AppName obrigatorio.' }
$servicePath = Join-Path $repo 'android/app/google-services.json'
$original = $null
$hadFile = Test-Path $servicePath
$oldDisplay = [Environment]::GetEnvironmentVariable('ORG_GRADLE_PROJECT_LOJA_DISPLAY_NAME')
$oldId = [Environment]::GetEnvironmentVariable('ORG_GRADLE_PROJECT_LOJA_APPLICATION_ID')
try {
  if ($hadFile) { $original = [System.IO.File]::ReadAllBytes($servicePath) }
  if ($GoogleServicesJson) {
    $newFile = (Resolve-Path $GoogleServicesJson).Path
    Copy-Item -LiteralPath $newFile -Destination $servicePath -Force
  }
  if (-not (Test-Path $servicePath)) { throw 'google-services.json necessario pois o projeto ainda usa o plugin Firebase. Consulte o guia P1.' }
  $services = Get-Content $servicePath -Raw | ConvertFrom-Json
  $matches = @($services.client | Where-Object { $_.client_info.android_client_info.package_name -eq $ApplicationId })
  if ($matches.Count -eq 0) { throw "O google-services.json nao possui pacote $ApplicationId. Use -GoogleServicesJson correspondente." }
  $env:ORG_GRADLE_PROJECT_LOJA_DISPLAY_NAME = $AppName
  $env:ORG_GRADLE_PROJECT_LOJA_APPLICATION_ID = $ApplicationId
  Push-Location $repo
  try {
    & flutter pub get
    if ($LASTEXITCODE -ne 0) { throw 'flutter pub get falhou' }
    & flutter build apk --release '--dart-define=LOJA_BACKEND=railway' "--dart-define=LOJA_API_BASE_URL=$BackendUrl" "--dart-define=LOJA_STORE_SLUG=$StoreSlug" "--dart-define=LOJA_APP_NAME=$AppName"
    if ($LASTEXITCODE -ne 0) { throw 'flutter build apk falhou' }
    Write-Host "APK criado em $repo\build\app\outputs\flutter-apk\app-release.apk"
    Write-Warning 'A configuracao de assinatura release ainda usa a chave de debug do projeto. Configure sua assinatura antes de distribuir comercialmente.'
  } finally { Pop-Location }
} finally {
  [Environment]::SetEnvironmentVariable('ORG_GRADLE_PROJECT_LOJA_DISPLAY_NAME',$oldDisplay)
  [Environment]::SetEnvironmentVariable('ORG_GRADLE_PROJECT_LOJA_APPLICATION_ID',$oldId)
  if ($hadFile) { [System.IO.File]::WriteAllBytes($servicePath,$original) }
  elseif (Test-Path $servicePath) { Remove-Item $servicePath -Force }
}
