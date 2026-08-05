# Rwanda GeoPortal Automatic Startup Script
$ErrorActionPreference = "SilentlyContinue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Freeing ports 8001 and 5000..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8001, 5000 -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

$PythonExe = Join-Path $ScriptDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "artifacts\geoportal"

Write-Host "Starting FastAPI Backend (http://localhost:8001)..." -ForegroundColor Cyan
Start-Process -FilePath $PythonExe -ArgumentList "-m uvicorn main:app --reload --host 127.0.0.1 --port 8001" -WorkingDirectory $BackendDir

$env:PORT = "5000"
$env:BASE_PATH = "/"

Write-Host "Starting Vite Frontend (http://localhost:5000)..." -ForegroundColor Cyan
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx vite --config vite.config.ts --port 5000 --host 0.0.0.0 --open" -WorkingDirectory $FrontendDir

Write-Host "`nGeoPortal is now running!" -ForegroundColor Green
Write-Host "Backend API:  http://localhost:8001" -ForegroundColor Green
Write-Host "Frontend UI:  http://localhost:5000`n" -ForegroundColor Green
