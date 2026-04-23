"""
Project Manager 시작 스크립트 (Windows / Linux 공용)
1. 프론트엔드 빌드  →  backend/static/
2. uvicorn 백엔드 시작
"""
import subprocess
import sys
import os
import platform

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT, "frontend")
BACKEND_DIR  = os.path.join(ROOT, "backend")

# 리눅스 환경일 때 tsc와 vite에 실행 권한 부여
if platform.system() == 'Linux':
    print("[Project Manager] Granting execute permission to tsc and vite...")
    subprocess.run("chmod +x node_modules/.bin/tsc node_modules/.bin/vite", cwd=FRONTEND_DIR, shell=True)
    # npm 선택적 의존성 문제 해결을 위해 package-lock.json과 node_modules 삭제 후 재설치
    print("[Project Manager] Removing package-lock.json and node_modules for npm reinstall...")
    subprocess.run("rm -f package-lock.json && rm -rf node_modules", cwd=FRONTEND_DIR, shell=True)
    print("[Project Manager] Reinstalling npm packages...")
    subprocess.run("npm install", cwd=FRONTEND_DIR, shell=True)

# PyJWT 설치 여부만 확인 (Anaconda 환경에서 전체 재설치 시 pydantic-core 빌드 오류 방지)
try:
    import jwt  # noqa: F401
except ImportError:
    print("[Project Manager] Installing PyJWT...")
    subprocess.run(
        f"{sys.executable} -m pip install PyJWT==2.8.0 -q",
        shell=True,
        check=True,
    )

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
