# Project Manager

FastAPI + React 기반의 프로젝트 관리 웹 애플리케이션입니다.  
간트 차트(주/월 단위)와 칸반 보드를 통해 프로젝트, Tech Item, Activity를 관리합니다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python 3.11 (conda SPDM), FastAPI, Uvicorn, SQLAlchemy 2.0, SQLite (WAL) |
| 프론트엔드 | Node.js 18+, React 18, TypeScript, Vite 5, TailwindCSS 3, TanStack Query v5 |
| 실시간 | WebSocket (FastAPI) |
| DB | SQLite (`backend/project_manager.db`) |

---

## 프로젝트 구조

```
Project_Manager/
├── backend/
│   ├── main.py              # FastAPI 앱 (API + WebSocket + 정적 파일 서빙)
│   ├── models.py            # SQLAlchemy ORM 모델
│   ├── schemas.py           # Pydantic 요청/응답 스키마
│   ├── database.py          # DB 연결, WAL 설정
│   ├── requirements.txt
│   └── static/              # 빌드된 프론트엔드 (npm run build 결과물)
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios API 함수
│   │   ├── components/      # React 컴포넌트 (GanttChart, KanbanBoard, ...)
│   │   ├── contexts/        # AppContext (전역 상태)
│   │   ├── hooks/           # useWebSocket
│   │   └── types/           # TypeScript 타입 정의
│   ├── package.json
│   └── vite.config.ts       # dev: /api → localhost:7010 프록시 / build: backend/static 출력
├── start_app.py             # App Manager 실행 스크립트 (Windows/Linux 공용, 빌드 + 백엔드 시작)
├── start_app.bat            # Windows 직접 실행용 (더블클릭)
├── start_backend.bat        # 개발용 백엔드 단독 실행
├── start_frontend.bat       # 개발용 프론트엔드 단독 실행 (Vite dev)
└── README.md
```

---

## App Manager 등록 (권장)

[App Manager](../App_Manager)를 통해 실행/중지를 관리합니다.

| 필드 | 값 |
|------|-----|
| 앱 이름 | `Project Manager` |
| 앱 타입 | `FastAPI + React` |
| 폴더 경로 | `C:\Users\psm55\Git\Project_Manager` |
| 포트 | `7010` |
| 시작 명령 | `python start_app.py` |
| Conda 환경 | `base` |

**실행 시 동작:**
1. `frontend/` 빌드 → `backend/static/` 에 저장
2. `backend/` uvicorn 시작 → `http://localhost:7010` 에서 UI + API 서빙

**중지 시:** uvicorn 종료와 함께 프론트엔드도 함께 내려감 (단일 포트).

---

## 개발 환경 (로컬)

백엔드와 프론트엔드를 각각 실행하여 Vite hot reload를 사용합니다.

### 백엔드 실행 (포트 7010)

```bat
start_backend.bat
```

또는:
```bat
cd backend
uvicorn main:app --host 0.0.0.0 --port 7010 --reload
```

### 프론트엔드 실행 (포트 5173, hot reload)

```bat
start_frontend.bat
```

또는:
```bat
cd frontend
npm install
npm run dev
```

개발 시 접속: `http://localhost:5173`  
(Vite가 `/api` 요청을 `http://localhost:7010`으로 프록시)

---

## 프론트엔드 빌드 (수동)

```bat
cd frontend
npm run build
```

빌드 결과물은 `backend/static/`에 저장됩니다.  
빌드 후 `http://localhost:7010` 에서 백엔드가 정적 파일을 직접 서빙합니다.

---

## API 엔드포인트

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

Swagger UI: `http://localhost:7010/docs`

---

## 문제 해결

### 포트 충돌

```bat
netstat -ano | findstr :7010
taskkill /PID <PID> /F
```

### DB 초기화

```bat
del backend\project_manager.db
:: 서버 재시작 시 빈 DB 자동 생성
```

### 프론트엔드 캐시 초기화

```bat
cd frontend
rmdir /s /q node_modules
npm install
```
