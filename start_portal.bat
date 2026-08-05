@echo off
title Starting Rwanda GeoPortal...
cd /d "%~dp0"

echo [1/3] Freeing ports 8001 and 5000 if in use...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8001, 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/3] Starting FastAPI Backend on http://localhost:8001 ...
start "GeoPortal Backend (Port 8001)" /D "%~dp0backend" cmd /k ""%~dp0.venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8001"

echo [3/3] Starting Vite Frontend on http://localhost:5000 ...
set PORT=5000
set BASE_PATH=/
start "GeoPortal Frontend (Port 5000)" /D "%~dp0artifacts\geoportal" cmd /k "npx vite --config vite.config.ts --port 5000 --host 127.0.0.1 --open"

echo.
echo ========================================================
echo   Rwanda Environmental GeoPortal Started Automatically!
echo   - Backend API:  http://localhost:8001
echo   - Frontend UI:  http://localhost:5000
echo ========================================================
echo.
timeout /t 4
