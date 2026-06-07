$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectRoot

Write-Host "[1/4] Checking local MongoDB service..."
$mongoService = Get-Service | Where-Object {
  $_.Name -match 'mongo' -or $_.DisplayName -match 'mongo'
} | Select-Object -First 1

if (-not $mongoService) {
  Write-Host "MongoDB Windows service was not found."
  Write-Host "Install MongoDB Community Server, then re-run this script."
  exit 1
}

if ($mongoService.Status -ne "Running") {
  Write-Host "[2/4] Starting MongoDB service: $($mongoService.Name)"
  Start-Service -Name $mongoService.Name
  Start-Sleep -Seconds 2
}

$serviceCheck = Get-Service -Name $mongoService.Name
if ($serviceCheck.Status -ne "Running") {
  Write-Host "MongoDB service could not be started."
  exit 1
}

Write-Host "[3/4] Verifying MongoDB is listening on 127.0.0.1:27017..."
$mongoPortOk = (Test-NetConnection -ComputerName 127.0.0.1 -Port 27017 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $mongoPortOk) {
  Write-Host "MongoDB service is running but port 27017 is not reachable."
  exit 1
}

Write-Host "[4/4] Starting backend API..."
npm.cmd start
