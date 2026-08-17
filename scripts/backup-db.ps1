# Nightly backup of this deployment's database (see server/.env for which one).
# Keeps the 30 most recent dumps. Schedule via Task Scheduler.

$ErrorActionPreference = 'Stop'

$project   = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $project 'backups'
$mysqldump = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
$user      = 'root'

# Read the database name and password from server/.env instead of duplicating
# them here -- a copy hardcoded in this script would silently go stale (and
# break backups, or back up the wrong site's database) the next time either
# changes in .env. Same reason server/lib/backup.js (the in-app "Backup now"
# button) reads both from process.env rather than a constant.
$envFile = Join-Path $project 'server\.env'
if (-not (Test-Path $envFile)) { throw "server\.env not found at $envFile" }
$envLines = Get-Content $envFile
$databaseLine = $envLines | Where-Object { $_ -match '^DB_NAME=' } | Select-Object -First 1
if (-not $databaseLine) { throw "DB_NAME not found in $envFile" }
$database = $databaseLine -replace '^DB_NAME=', ''
$passwordLine = $envLines | Where-Object { $_ -match '^DB_PASSWORD=' } | Select-Object -First 1
if (-not $passwordLine) { throw "DB_PASSWORD not found in $envFile" }
$password = $passwordLine -replace '^DB_PASSWORD=', ''

if (-not (Test-Path $mysqldump)) { throw "mysqldump not found at $mysqldump" }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$out   = Join-Path $backupDir "${database}_$stamp.sql"

& $mysqldump --user=$user "--password=$password" --single-transaction `
             --routines --triggers --databases $database |
  Out-File -FilePath $out -Encoding utf8

if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
if (-not (Test-Path $out) -or (Get-Item $out).Length -lt 1kb) {
    throw "Backup looks empty: $out"
}

Write-Host ("Backup OK: {0} ({1:N1} MB)" -f $out, ((Get-Item $out).Length / 1MB))

# retention: keep the newest 30
Get-ChildItem $backupDir -Filter "$database`_*.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force

# PO attachment images live on disk, not in the DB (see
# db/migrations/011_po_attachments.sql) -- mysqldump above never captures
# them, so zip the uploads folder alongside the SQL dump on the same schedule.
$uploadsDir = Join-Path $project 'server\uploads'
if (Test-Path $uploadsDir) {
    $uploadsZip = Join-Path $backupDir "uploads_$stamp.zip"
    Compress-Archive -Path $uploadsDir -DestinationPath $uploadsZip -Force
    Write-Host ("Uploads backup OK: {0} ({1:N1} MB)" -f $uploadsZip, ((Get-Item $uploadsZip).Length / 1MB))

    Get-ChildItem $backupDir -Filter 'uploads_*.zip' |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 30 |
      Remove-Item -Force
}
