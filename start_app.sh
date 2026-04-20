#!/usr/bin/env bash
# Project Manager 시작 스크립트 (Linux / macOS)
# 1. 프론트엔드 빌드  →  backend/static/
# 2. uvicorn 백엔드 시작

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"

# PyJWT만 필요 시 설치 (전체 재설치 시 빌드 오류 방지)
python3 -c "import jwt" 2>/dev/null || pip install PyJWT==2.8.0 -q

echo "[Project Manager] Building frontend..."
cd "$FRONTEND_DIR"
npm install --silent
npm run build

echo ""
echo "[Project Manager] Starting backend on http://0.0.0.0:7010"
echo "  Access: http://localhost:7010"
echo ""
cd "$BACKEND_DIR"
uvicorn main:app --host 0.0.0.0 --port 7010
