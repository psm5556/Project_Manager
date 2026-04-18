# Project Manager

FastAPI + React 기반의 프로젝트 관리 웹 애플리케이션입니다.  
간트 차트(주/월 단위)와 칸반 보드를 통해 프로젝트, Tech Item, Activity를 관리합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python 3.10+, FastAPI 0.104, Uvicorn, SQLAlchemy 2.0, SQLite (WAL) |
| 프론트엔드 | Node.js 18+, React 18, TypeScript, Vite 5, TailwindCSS 3, TanStack Query v5 |
| 실시간 | WebSocket (FastAPI) |
| DB | SQLite (파일: `backend/project_manager.db`) |

---

## 프로젝트 구조

```
Project_Manager/
├── backend/
│   ├── main.py          # FastAPI 앱, 라우터
│   ├── models.py        # SQLAlchemy ORM 모델
│   ├── schemas.py       # Pydantic 요청/응답 스키마
│   ├── database.py      # DB 연결, WAL 설정
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/         # Axios API 함수
│   │   ├── components/  # React 컴포넌트
│   │   │   ├── GanttChart.tsx
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── modals/
│   │   ├── contexts/    # AppContext (전역 상태)
│   │   ├── hooks/       # useWebSocket
│   │   └── types/       # TypeScript 타입 정의
│   ├── package.json
│   └── vite.config.ts
├── start_backend.bat    # Windows 백엔드 실행 스크립트
├── start_frontend.bat   # Windows 프론트엔드 실행 스크립트
└── README.md
```

---

## Windows — 개발 환경

### 사전 요구사항

- **Python 3.10 이상** — [python.org](https://www.python.org/downloads/) 또는 Anaconda
- **Node.js 18 이상** — [nodejs.org](https://nodejs.org/)
- **Git** — [git-scm.com](https://git-scm.com/)

버전 확인:
```cmd
python --version
node --version
npm --version
```

### 1. 저장소 클론

```cmd
git clone https://github.com/psm5556/Project_Manager.git
cd Project_Manager
```

### 2. 백엔드 설정 및 실행

```cmd
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

또는 제공된 배치 파일 실행 (더블클릭 또는 CMD):
```cmd
start_backend.bat
```

백엔드 서버: `http://localhost:8000`  
API 문서 (Swagger): `http://localhost:8000/docs`

### 3. 프론트엔드 설정 및 실행

새 CMD/터미널 창에서:
```cmd
cd frontend
npm install
npm run dev
```

또는:
```cmd
start_frontend.bat
```

프론트엔드: `http://localhost:5173`

> **참고**: Vite 개발 서버가 `/api` 요청을 `http://localhost:8000`으로 프록시합니다.  
> 백엔드와 프론트엔드를 **동시에** 실행해야 합니다.

### 4. 가상환경 사용 (선택)

```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Windows — 테스트

### API 테스트 (Swagger UI)

브라우저에서 `http://localhost:8000/docs` 접속 후 엔드포인트 직접 테스트.

### API 테스트 (curl)

```cmd
:: 프로젝트 목록 조회
curl http://localhost:8000/api/projects

:: 프로젝트 생성
curl -X POST http://localhost:8000/api/projects ^
  -H "Content-Type: application/json" ^
  -d "{\"name\": \"테스트 프로젝트\", \"description\": \"설명\"}"

:: Activity 목록 조회 (project_id=1)
curl http://localhost:8000/api/projects/1/activities
```

### TypeScript 타입 체크

```cmd
cd frontend
npx tsc --noEmit
```

---

## Windows — 배포 (프로덕션)

### 방법 A: 단일 서버 배포 (권장)

프론트엔드를 빌드하고, FastAPI가 정적 파일을 함께 서빙합니다.

**1) 프론트엔드 빌드**

```cmd
cd frontend
npm run build
```

`frontend/dist/` 디렉터리에 빌드 결과물 생성.

**2) FastAPI에 정적 파일 서빙 추가**

`backend/main.py`에 아래 코드 추가 (기존 `app = FastAPI(...)` 아래):

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# 정적 파일 서빙
DIST_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.exists(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(DIST_DIR, "index.html")
        return FileResponse(index)
```

**3) 프로덕션 서버 실행**

```cmd
cd backend
pip install uvicorn[standard]
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

접속: `http://localhost:8000`

**4) Windows 서비스 등록 (NSSM 사용)**

[NSSM](https://nssm.cc/) 다운로드 후:

```cmd
nssm install ProjectManager "C:\Python310\python.exe"
:: 인수: -m uvicorn main:app --host 0.0.0.0 --port 8000
:: 시작 디렉터리: C:\path\to\Project_Manager\backend
nssm start ProjectManager
```

### 방법 B: IIS + ARR 리버스 프록시

1. IIS에서 ARR(Application Request Routing) 모듈 설치
2. Uvicorn 서버를 8000 포트에서 실행 (방법 A 참고)
3. IIS 사이트에서 URL Rewrite 규칙으로 모든 요청을 `http://localhost:8000`으로 전달

---

## Linux — 개발 환경

### 사전 요구사항

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git curl

# Node.js 18 설치 (nvm 사용 권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 버전 확인
python3 --version
node --version
npm --version
```

```bash
# CentOS/RHEL/Rocky Linux
sudo dnf install -y python3 python3-pip git curl
# Node.js는 위 nvm 방법 동일
```

### 1. 저장소 클론

```bash
git clone https://github.com/psm5556/Project_Manager.git
cd Project_Manager
```

### 2. 백엔드 설정 및 실행

```bash
cd backend

# 가상환경 생성 (권장)
python3 -m venv venv
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt

# 개발 서버 실행 (--reload: 코드 변경 시 자동 재시작)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

백엔드: `http://localhost:8000`  
API 문서: `http://localhost:8000/docs`

### 3. 프론트엔드 설정 및 실행

새 터미널에서:
```bash
cd frontend
npm install
npm run dev
```

프론트엔드: `http://localhost:5173`

### 4. 백그라운드 실행 (개발 시)

```bash
# 백엔드 백그라운드 실행
cd backend && source venv/bin/activate
nohup uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../logs/backend.log 2>&1 &
echo $! > ../backend.pid

# 프론트엔드 백그라운드 실행
cd frontend
nohup npm run dev > ../logs/frontend.log 2>&1 &
echo $! > ../frontend.pid

# 종료
kill $(cat backend.pid) && kill $(cat frontend.pid)
```

---

## Linux — 테스트

### API 테스트 (curl)

```bash
# 프로젝트 목록 조회
curl -s http://localhost:8000/api/projects | python3 -m json.tool

# 프로젝트 생성
curl -s -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "테스트 프로젝트", "description": "설명"}' | python3 -m json.tool

# Tech Item 생성 (project_id=1)
curl -s -X POST http://localhost:8000/api/tech_items \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1, "name": "Backend"}' | python3 -m json.tool

# Activity 생성
curl -s -X POST http://localhost:8000/api/activities \
  -H "Content-Type: application/json" \
  -d '{"tech_item_id": 1, "name": "API 개발", "start_date": "2026-04-01", "end_date": "2026-04-30", "status": "in_progress"}' \
  | python3 -m json.tool
```

### TypeScript 타입 체크

```bash
cd frontend
npx tsc --noEmit
```

### WebSocket 테스트

```bash
# wscat 설치
npm install -g wscat

# 연결 테스트
wscat -c ws://localhost:8000/ws
```

---

## Linux — 배포 (프로덕션)

### 방법 A: Nginx + Uvicorn (권장)

**1) 시스템 패키지 설치**

```bash
sudo apt install -y nginx
```

**2) 프론트엔드 빌드**

```bash
cd frontend
npm install
npm run build
# 결과물: frontend/dist/
```

**3) Uvicorn 프로덕션 실행**

```bash
cd backend
source venv/bin/activate
# workers: CPU 코어 수 × 2 + 1 권장
uvicorn main:app --host 127.0.0.1 --port 8000 --workers 4
```

**4) systemd 서비스 등록**

`/etc/systemd/system/project-manager.service` 파일 생성:

```ini
[Unit]
Description=Project Manager FastAPI
After=network.target

[Service]
Type=exec
User=www-data
WorkingDirectory=/opt/Project_Manager/backend
ExecStart=/opt/Project_Manager/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable project-manager
sudo systemctl start project-manager
sudo systemctl status project-manager
```

**5) Nginx 설정**

`/etc/nginx/sites-available/project-manager`:

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 도메인 또는 서버 IP

    # 프론트엔드 정적 파일
    root /opt/Project_Manager/frontend/dist;
    index index.html;

    # SPA 라우팅 (React Router 대응)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 프록시
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket 프록시
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/project-manager /etc/nginx/sites-enabled/
sudo nginx -t       # 설정 문법 검사
sudo systemctl restart nginx
```

**6) HTTPS 설정 (Let's Encrypt)**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

### 방법 B: Docker Compose

프로젝트 루트에 `Dockerfile.backend` 생성:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

`Dockerfile.frontend` 생성:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` 생성:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`docker-compose.yml` 생성:

```yaml
version: '3.9'
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    volumes:
      - ./backend/project_manager.db:/app/project_manager.db
    restart: always
    expose:
      - "8000"

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: always
```

```bash
docker compose up -d --build
docker compose logs -f        # 로그 확인
docker compose down           # 종료
```

---

## 환경 변수 (선택)

현재 기본값으로 동작하지만, 아래 환경 변수로 설정을 변경할 수 있습니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `sqlite:///./project_manager.db` | DB 연결 문자열 |
| `PORT` | `8000` | 백엔드 포트 |

예시:
```bash
# Linux
export DATABASE_URL="sqlite:////data/project_manager.db"
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## API 엔드포인트 요약

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| PUT | `/api/projects/{id}` | 프로젝트 수정 |
| DELETE | `/api/projects/{id}` | 프로젝트 삭제 |
| GET | `/api/projects/{id}/tech_items` | Tech Item 목록 |
| POST | `/api/tech_items` | Tech Item 생성 |
| PUT | `/api/tech_items/{id}` | Tech Item 수정 |
| DELETE | `/api/tech_items/{id}` | Tech Item 삭제 |
| GET | `/api/projects/{id}/activities` | 프로젝트 전체 Activity |
| GET | `/api/tech_items/{id}/activities` | Tech Item별 Activity |
| POST | `/api/activities` | Activity 생성 |
| PUT | `/api/activities/{id}` | Activity 수정 |
| DELETE | `/api/activities/{id}` | Activity 삭제 |
| WS | `/ws` | WebSocket 실시간 연결 |

전체 Swagger 문서: `http://localhost:8000/docs`

---

## 문제 해결

### 포트 충돌

```bash
# Linux
lsof -i :8000
kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### DB 초기화

```bash
# 백엔드 종료 후
rm backend/project_manager.db
# 서버 재시작 시 빈 DB 자동 생성
```

### 프론트엔드 캐시 초기화

```bash
cd frontend
rm -rf node_modules dist
npm install
npm run dev
```

### CORS 오류

개발 시 Vite 프록시(`vite.config.ts`)를 통해 API를 호출하므로 CORS 오류가 발생하지 않습니다.  
직접 `http://localhost:8000`으로 API를 호출하는 경우 `main.py`의 `CORSMiddleware` 설정을 확인하세요.

---

## 라이선스

MIT
