@echo off
cd /d "%~dp0"

echo [Project Manager] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    exit /b 1
)

echo [Project Manager] Starting backend on http://localhost:7010
cd ..\backend
uvicorn main:app --host 0.0.0.0 --port 7010
