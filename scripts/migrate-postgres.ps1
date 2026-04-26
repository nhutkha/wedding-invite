param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDatabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$TargetDatabaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$BackupFile = "./tmp/postgres-migration.dump",

  [Parameter(Mandatory = $false)]
  [switch]$KeepBackup
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[migrate-postgres] $Message" -ForegroundColor Cyan
}

function Ensure-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required."
  }
}

function Resolve-AbsolutePath {
  param([string]$PathValue)

  $fullPath = [System.IO.Path]::GetFullPath($PathValue)
  $directory = Split-Path -Path $fullPath -Parent

  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  return $fullPath
}

function Test-CommandExists {
  param([string]$CommandName)

  return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Export-UsingLocalTools {
  param([string]$SourceUrl, [string]$BackupPath)

  Write-Step "Creating backup from source database (local pg_dump)."
  & pg_dump --dbname="$SourceUrl" --format=custom --file="$BackupPath"
}

function Import-UsingLocalTools {
  param([string]$TargetUrl, [string]$BackupPath)

  Write-Step "Restoring backup to target database (local pg_restore)."
  & pg_restore --dbname="$TargetUrl" --clean --if-exists --no-owner --no-privileges "$BackupPath"
}

function Export-UsingDocker {
  param([string]$SourceUrl, [string]$BackupPath)

  $backupDir = Split-Path -Path $BackupPath -Parent
  $backupName = Split-Path -Path $BackupPath -Leaf

  Write-Step "Creating backup from source database (docker postgres image)."
  & docker run --rm `
    -e SOURCE_DATABASE_URL="$SourceUrl" `
    -v "${backupDir}:/work" `
    postgres:16 `
    sh -lc "pg_dump \"`$SOURCE_DATABASE_URL\" -Fc -f /work/$backupName"
}

function Import-UsingDocker {
  param([string]$TargetUrl, [string]$BackupPath)

  $backupDir = Split-Path -Path $BackupPath -Parent
  $backupName = Split-Path -Path $BackupPath -Leaf

  Write-Step "Restoring backup to target database (docker postgres image)."
  & docker run --rm `
    -e TARGET_DATABASE_URL="$TargetUrl" `
    -v "${backupDir}:/work" `
    postgres:16 `
    sh -lc "pg_restore --dbname=\"`$TARGET_DATABASE_URL\" --clean --if-exists --no-owner --no-privileges /work/$backupName"
}

Ensure-Value -Name "SourceDatabaseUrl" -Value $SourceDatabaseUrl
Ensure-Value -Name "TargetDatabaseUrl" -Value $TargetDatabaseUrl

$backupAbsolutePath = Resolve-AbsolutePath -PathValue $BackupFile

$hasLocalPgDump = Test-CommandExists -CommandName "pg_dump"
$hasLocalPgRestore = Test-CommandExists -CommandName "pg_restore"
$hasDocker = Test-CommandExists -CommandName "docker"

if (($hasLocalPgDump -and -not $hasLocalPgRestore) -or (-not $hasLocalPgDump -and $hasLocalPgRestore)) {
  throw "Found only one PostgreSQL tool. Please install both pg_dump and pg_restore, or use Docker."
}

if (-not $hasLocalPgDump -and -not $hasDocker) {
  throw "Neither local PostgreSQL tools nor Docker are available. Install PostgreSQL client tools or Docker Desktop first."
}

if ($hasLocalPgDump -and $hasLocalPgRestore) {
  Export-UsingLocalTools -SourceUrl $SourceDatabaseUrl -BackupPath $backupAbsolutePath
  Import-UsingLocalTools -TargetUrl $TargetDatabaseUrl -BackupPath $backupAbsolutePath
} else {
  Export-UsingDocker -SourceUrl $SourceDatabaseUrl -BackupPath $backupAbsolutePath
  Import-UsingDocker -TargetUrl $TargetDatabaseUrl -BackupPath $backupAbsolutePath
}

Write-Step "Migration completed successfully."
Write-Step "Next step: update DATABASE_URL in Render service with the target database URL, then redeploy."

if (-not $KeepBackup) {
  Write-Step "Cleaning backup file (use -KeepBackup to keep it)."
  Remove-Item -LiteralPath $backupAbsolutePath -Force -ErrorAction SilentlyContinue
}
