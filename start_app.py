"""
Project Manager 시작 스크립트 (Windows / Linux 공용)
1. 프론트엔드 빌드  →  backend/static/
2. uvicorn 백엔드 시작
"""
import subprocess
import sys
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT, "frontend")
BACKEND_DIR  = os.path.join(ROOT, "backend")

print("[Project Manager] Building frontend...")
build = subprocess.run("npm run build", cwd=FRONTEND_DIR, shell=True)
if build.returncode != 0:
    print("[ERROR] Frontend build failed")
    sys.exit(1)

print("[Project Manager] Starting backend on http://localhost:7010")
subprocess.run(
    "uvicorn main:app --host 0.0.0.0 --port 7010",
    cwd=BACKEND_DIR,
    shell=True,
)
