@echo off
cd /d "%~dp0backend"
echo Installing Python dependencies...
C:\Users\psm55\anaconda3\python.exe -m pip install fastapi "uvicorn[standard]" sqlalchemy pydantic python-multipart
echo Starting backend server on http://localhost:8000
C:\Users\psm55\anaconda3\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
