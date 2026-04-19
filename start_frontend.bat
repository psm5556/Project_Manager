@echo off
cd /d "%~dp0frontend"
echo Installing Node dependencies...
npm install
echo Starting frontend on http://localhost:7010
npm run dev
