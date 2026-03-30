param(
  [Parameter(Mandatory = $false)]
  [string]$ProjectId,

  [Parameter(Mandatory = $false)]
  [string]$ApiBaseUrl = "http://localhost:8787/api"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[deploy] $Message" -ForegroundColor Cyan
}

Set-Location -LiteralPath (Join-Path $PSScriptRoot "..")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Please install Node.js LTS first."
}

$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $npmCmd) {
  throw "npm is not available. Please reinstall Node.js."
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  $ProjectId = Read-Host "Enter your Firebase Project ID"
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  throw "Firebase Project ID is required."
}

Write-Step "Ensuring production env file exists"
$envProdPath = Join-Path (Get-Location) "web/.env.production"
$envProdContent = "VITE_API_BASE_URL=$ApiBaseUrl`n"
Set-Content -LiteralPath $envProdPath -Value $envProdContent -Encoding UTF8

Write-Step "Installing root dependencies"
& $npmCmd.Path install

Write-Step "Installing web dependencies"
& $npmCmd.Path install --prefix web

Write-Step "Building frontend"
& $npmCmd.Path run build --prefix web

Write-Step "Writing Firebase project id to .firebaserc"
$firebaseRcPath = Join-Path (Get-Location) ".firebaserc"
$firebaseRc = @{
  projects = @{
    default = $ProjectId
  }
}
$firebaseRc | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $firebaseRcPath -Encoding UTF8

Write-Step "Checking Firebase CLI"
$firebaseCmd = Get-Command firebase.cmd -ErrorAction SilentlyContinue
if (-not $firebaseCmd) {
  $firebaseCmd = Get-Command firebase -ErrorAction SilentlyContinue
}

if (-not $firebaseCmd) {
  Write-Step "Firebase CLI not found globally. Using npx firebase-tools"
  $npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
  if (-not $npxCmd) {
    $npxCmd = Get-Command npx -ErrorAction SilentlyContinue
  }

  if (-not $npxCmd) {
    throw "npx is not available. Please reinstall Node.js."
  }

  Write-Step "Logging in to Firebase (browser will open if needed)"
  & $npxCmd.Path firebase-tools login

  Write-Step "Deploying Firebase Hosting"
  & $npxCmd.Path firebase-tools deploy --only hosting --project $ProjectId
} else {
  Write-Step "Logging in to Firebase (browser will open if needed)"
  & $firebaseCmd.Path login

  Write-Step "Deploying Firebase Hosting"
  & $firebaseCmd.Path deploy --only hosting --project $ProjectId
}

Write-Step "Done. Your site is live on Firebase Hosting."
