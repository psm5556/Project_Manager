from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import List, Optional
import json
import os

from database import SessionLocal, engine, Base
import models
import schemas
import auth as auth_utils

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Project Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── DB migration (add columns to existing tables) ────────────────────────────

ADMIN_KNOX_ID = "sm556.park"


@app.on_event("startup")
def run_migrations():
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE projects ADD COLUMN created_by INTEGER REFERENCES users(id)",
            "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # Column already exists

    # Ensure default admin account exists
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.knox_id == ADMIN_KNOX_ID).first()
        if admin and not admin.is_admin:
            admin.is_admin = True
            db.commit()
    finally:
        db.close()


# ─── WebSocket ────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        msg = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Auth dependency ──────────────────────────────────────────────────────────

security = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    if not credentials:
        return None
    try:
        payload = auth_utils.decode_token(credentials.credentials)
        user_id = int(payload["sub"])
        return db.query(models.User).filter(models.User.id == user_id).first()
    except Exception:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    if not credentials:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = auth_utils.decode_token(credentials.credentials)
        user_id = int(payload["sub"])
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid or expired token")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_user_role(project_id: int, user_id: int, db: Session) -> Optional[str]:
    """Returns user's role in a project, or 'master' for legacy projects (no members)."""
    count = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id
    ).count()
    if count == 0:
        return "master"  # Legacy project - all users are treated as master
    member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == project_id,
        models.ProjectMember.user_id == user_id,
    ).first()
    return member.role if member else None


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(403, "관리자 권한이 필요합니다")
    return current_user


def require_member(project_id: int, user: models.User, db: Session) -> str:
    role = get_user_role(project_id, user.id, db)
    if role is None:
        raise HTTPException(403, "Access denied")
    return role


def require_master(project_id: int, user: models.User, db: Session):
    role = get_user_role(project_id, user.id, db)
    if role != "master":
        raise HTTPException(403, "Master permission required")


def build_project_response(p: models.Project, user_id: int, db: Session) -> dict:
    role = get_user_role(p.id, user_id, db)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description or "",
        "version": p.version,
        "created_by": p.created_by,
        "user_role": role,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ─── Auth endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=schemas.TokenResponse, status_code=201)
def register(body: schemas.UserRegister, db: Session = Depends(get_db)):
    if len(body.pin) != 6 or not body.pin.isdigit():
        raise HTTPException(400, "PIN은 6자리 숫자여야 합니다")
    existing = db.query(models.User).filter(models.User.knox_id == body.knox_id).first()
    if existing:
        raise HTTPException(409, "이미 사용 중인 Knox ID입니다")
    pin_hash, pin_salt = auth_utils.hash_pin(body.pin)
    user = models.User(name=body.name, knox_id=body.knox_id, pin_hash=pin_hash, pin_salt=pin_salt)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth_utils.create_token(user.id, user.knox_id)
    return {"token": token, "user": user}


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(body: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.knox_id == body.knox_id).first()
    if not user or not auth_utils.verify_pin(body.pin, user.pin_hash, user.pin_salt):
        raise HTTPException(401, "Knox ID 또는 PIN이 올바르지 않습니다")
    token = auth_utils.create_token(user.id, user.knox_id)
    return {"token": token, "user": user}


@app.get("/api/auth/me", response_model=schemas.UserResponse)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ─── User search ──────────────────────────────────────────────────────────────

@app.get("/api/users/search", response_model=List[schemas.UserResponse])
def search_users(
    q: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    like = f"%{q}%"
    users = db.query(models.User).filter(
        (models.User.name.like(like)) | (models.User.knox_id.like(like))
    ).limit(20).all()
    return users


# ─── Projects ─────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
def list_projects(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_projects = db.query(models.Project).order_by(models.Project.id).all()
    result = []
    for p in all_projects:
        role = get_user_role(p.id, current_user.id, db)
        if role is not None:
            result.append(build_project_response(p, current_user.id, db))
    return result


@app.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
async def create_project(
    body: schemas.ProjectCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = models.Project(**body.model_dump(), created_by=current_user.id)
    db.add(obj)
    db.flush()
    # Add creator as master
    member = models.ProjectMember(project_id=obj.id, user_id=current_user.id, role="master")
    db.add(member)
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "project_created", "data": {"id": obj.id}})
    return build_project_response(obj, current_user.id, db)


@app.put("/api/projects/{pid}", response_model=schemas.ProjectResponse)
async def update_project(
    pid: int,
    body: schemas.ProjectUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.Project).filter(models.Project.id == pid).first()
    if not obj:
        raise HTTPException(404, "Project not found")
    require_member(pid, current_user, db)
    if obj.version != body.version:
        raise HTTPException(409, "Version conflict — please reload and retry")
    obj.name = body.name
    obj.description = body.description or ""
    obj.version += 1
    obj.updated_at = datetime.now()
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "project_updated", "data": {"id": pid}})
    return build_project_response(obj, current_user.id, db)


@app.delete("/api/projects/{pid}")
async def delete_project(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.Project).filter(models.Project.id == pid).first()
    if not obj:
        raise HTTPException(404, "Project not found")
    require_master(pid, current_user, db)
    db.delete(obj)
    db.commit()
    await manager.broadcast({"type": "project_deleted", "data": {"id": pid}})
    return {"ok": True}


# ─── Project Members ──────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/members", response_model=List[schemas.MemberResponse])
def list_members(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member(pid, current_user, db)
    members = db.query(models.ProjectMember).filter(models.ProjectMember.project_id == pid).all()
    result = []
    for m in members:
        result.append({
            "id": m.id,
            "user_id": m.user_id,
            "name": m.user.name,
            "knox_id": m.user.knox_id,
            "role": m.role,
            "created_at": m.created_at,
        })
    return result


@app.post("/api/projects/{pid}/members", response_model=schemas.MemberResponse, status_code=201)
def add_member(
    pid: int,
    body: schemas.AddMemberRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_master(pid, current_user, db)
    target = db.query(models.User).filter(models.User.knox_id == body.knox_id).first()
    if not target:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    existing = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == pid,
        models.ProjectMember.user_id == target.id,
    ).first()
    if existing:
        raise HTTPException(409, "이미 프로젝트 멤버입니다")
    role = body.role if body.role in ("master", "member") else "member"
    m = models.ProjectMember(project_id=pid, user_id=target.id, role=role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "user_id": m.user_id, "name": target.name, "knox_id": target.knox_id, "role": m.role, "created_at": m.created_at}


@app.patch("/api/projects/{pid}/members/{uid}", response_model=schemas.MemberResponse)
def update_member_role(
    pid: int,
    uid: int,
    body: schemas.UpdateMemberRoleRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_master(pid, current_user, db)
    m = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == pid,
        models.ProjectMember.user_id == uid,
    ).first()
    if not m:
        raise HTTPException(404, "Member not found")
    if body.role not in ("master", "member"):
        raise HTTPException(400, "Invalid role")
    m.role = body.role
    db.commit()
    db.refresh(m)
    return {"id": m.id, "user_id": m.user_id, "name": m.user.name, "knox_id": m.user.knox_id, "role": m.role, "created_at": m.created_at}


@app.delete("/api/projects/{pid}/members/{uid}")
def remove_member(
    pid: int,
    uid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_master(pid, current_user, db)
    # Prevent removing the last master
    master_count = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == pid,
        models.ProjectMember.role == "master",
    ).count()
    target_member = db.query(models.ProjectMember).filter(
        models.ProjectMember.project_id == pid,
        models.ProjectMember.user_id == uid,
    ).first()
    if not target_member:
        raise HTTPException(404, "Member not found")
    if target_member.role == "master" and master_count <= 1:
        raise HTTPException(400, "마스터가 한 명 이상 있어야 합니다")
    db.delete(target_member)
    db.commit()
    return {"ok": True}


# ─── Tech Items ───────────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/tech_items", response_model=List[schemas.TechItemResponse])
def list_tech_items(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member(pid, current_user, db)
    return db.query(models.TechItem).filter(models.TechItem.project_id == pid).order_by(models.TechItem.order, models.TechItem.id).all()


@app.post("/api/tech_items", response_model=schemas.TechItemResponse, status_code=201)
async def create_tech_item(
    body: schemas.TechItemCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    require_member(body.project_id, current_user, db)
    obj = models.TechItem(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "tech_item_created", "data": {"id": obj.id, "project_id": obj.project_id}})
    return obj


@app.put("/api/tech_items/{tid}", response_model=schemas.TechItemResponse)
async def update_tech_item(
    tid: int,
    body: schemas.TechItemUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.TechItem).filter(models.TechItem.id == tid).first()
    if not obj:
        raise HTTPException(404, "Tech item not found")
    require_member(obj.project_id, current_user, db)
    if obj.version != body.version:
        raise HTTPException(409, "Version conflict — please reload and retry")
    obj.name = body.name
    obj.description = body.description or ""
    obj.order = body.order or 0
    obj.version += 1
    obj.updated_at = datetime.now()
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "tech_item_updated", "data": {"id": tid, "project_id": obj.project_id}})
    return obj


@app.delete("/api/tech_items/{tid}")
async def delete_tech_item(
    tid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.TechItem).filter(models.TechItem.id == tid).first()
    if not obj:
        raise HTTPException(404, "Tech item not found")
    require_member(obj.project_id, current_user, db)
    project_id = obj.project_id
    db.delete(obj)
    db.commit()
    await manager.broadcast({"type": "tech_item_deleted", "data": {"id": tid, "project_id": project_id}})
    return {"ok": True}


# ─── Activities ───────────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/activities", response_model=List[schemas.ActivityResponse])
def list_project_activities(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member(pid, current_user, db)
    return (
        db.query(models.Activity)
        .join(models.TechItem)
        .filter(models.TechItem.project_id == pid)
        .order_by(models.TechItem.order, models.TechItem.id, models.Activity.order, models.Activity.id)
        .all()
    )


@app.get("/api/tech_items/{tid}/activities", response_model=List[schemas.ActivityResponse])
def list_tech_item_activities(
    tid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ti = db.query(models.TechItem).filter(models.TechItem.id == tid).first()
    if ti:
        require_member(ti.project_id, current_user, db)
    return db.query(models.Activity).filter(models.Activity.tech_item_id == tid).order_by(models.Activity.order, models.Activity.id).all()


@app.post("/api/activities", response_model=schemas.ActivityResponse, status_code=201)
async def create_activity(
    body: schemas.ActivityCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == body.tech_item_id).first()
    if not tech_item:
        raise HTTPException(404, "Tech item not found")
    require_member(tech_item.project_id, current_user, db)
    obj = models.Activity(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    await manager.broadcast({
        "type": "activity_created",
        "data": {"id": obj.id, "tech_item_id": obj.tech_item_id, "project_id": tech_item.project_id},
    })
    return obj


@app.put("/api/activities/{aid}", response_model=schemas.ActivityResponse)
async def update_activity(
    aid: int,
    body: schemas.ActivityUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.Activity).filter(models.Activity.id == aid).first()
    if not obj:
        raise HTTPException(404, "Activity not found")
    if obj.version != body.version:
        raise HTTPException(409, "Version conflict — please reload and retry")
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == body.tech_item_id).first()
    if not tech_item:
        raise HTTPException(404, "Tech item not found")
    require_member(tech_item.project_id, current_user, db)
    for field, val in body.model_dump(exclude={"version"}).items():
        setattr(obj, field, val)
    obj.version += 1
    obj.updated_at = datetime.now()
    db.commit()
    db.refresh(obj)
    await manager.broadcast({
        "type": "activity_updated",
        "data": {"id": aid, "tech_item_id": obj.tech_item_id, "project_id": tech_item.project_id},
    })
    return obj


@app.delete("/api/activities/{aid}")
async def delete_activity(
    aid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    obj = db.query(models.Activity).filter(models.Activity.id == aid).first()
    if not obj:
        raise HTTPException(404, "Activity not found")
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == obj.tech_item_id).first()
    if tech_item:
        require_member(tech_item.project_id, current_user, db)
    project_id = tech_item.project_id if tech_item else None
    tech_item_id = obj.tech_item_id
    db.delete(obj)
    db.commit()
    await manager.broadcast({
        "type": "activity_deleted",
        "data": {"id": aid, "tech_item_id": tech_item_id, "project_id": project_id},
    })
    return {"ok": True}


# ─── Admin ────────────────────────────────────────────────────────────────────

@app.get("/api/admin/users", response_model=List[schemas.UserResponse])
def admin_list_users(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.User).order_by(models.User.created_at).all()


@app.patch("/api/admin/users/{uid}", response_model=schemas.UserResponse)
def admin_update_user(
    uid: int,
    body: schemas.AdminUserUpdate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    if body.name is not None:
        user.name = body.name.strip()
    if body.is_admin is not None:
        # Prevent removing own admin
        if uid == admin.id and not body.is_admin:
            raise HTTPException(400, "자신의 관리자 권한은 제거할 수 없습니다")
        user.is_admin = body.is_admin
    db.commit()
    db.refresh(user)
    return user


@app.post("/api/admin/users/{uid}/reset-pin", response_model=schemas.UserResponse)
def admin_reset_pin(
    uid: int,
    body: schemas.AdminResetPin,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if len(body.new_pin) != 6 or not body.new_pin.isdigit():
        raise HTTPException(400, "PIN은 6자리 숫자여야 합니다")
    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    pin_hash, pin_salt = auth_utils.hash_pin(body.new_pin)
    user.pin_hash = pin_hash
    user.pin_salt = pin_salt
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/admin/users/{uid}")
def admin_delete_user(
    uid: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if uid == admin.id:
        raise HTTPException(400, "자신의 계정은 삭제할 수 없습니다")
    user = db.query(models.User).filter(models.User.id == uid).first()
    if not user:
        raise HTTPException(404, "사용자를 찾을 수 없습니다")
    db.delete(user)
    db.commit()
    return {"ok": True}


# ─── Backups ──────────────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/backups", response_model=List[schemas.BackupResponse])
def list_backups(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_member(pid, current_user, db)
    backups = db.query(models.ProjectBackup).filter(
        models.ProjectBackup.project_id == pid
    ).order_by(models.ProjectBackup.created_at.desc()).all()
    result = []
    for b in backups:
        result.append({
            "id": b.id,
            "project_id": b.project_id,
            "name": b.name,
            "created_by_name": b.creator.name if b.creator else None,
            "created_at": b.created_at,
        })
    return result


@app.post("/api/projects/{pid}/backup", response_model=schemas.BackupResponse, status_code=201)
def create_backup(
    pid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(404, "Project not found")
    require_member(pid, current_user, db)

    # Build snapshot
    tech_items = db.query(models.TechItem).filter(models.TechItem.project_id == pid).order_by(models.TechItem.order, models.TechItem.id).all()
    snapshot = {
        "project_name": project.name,
        "project_description": project.description or "",
        "tech_items": [],
    }
    for ti in tech_items:
        activities = db.query(models.Activity).filter(models.Activity.tech_item_id == ti.id).order_by(models.Activity.order, models.Activity.id).all()
        snapshot["tech_items"].append({
            "name": ti.name,
            "description": ti.description or "",
            "order": ti.order,
            "activities": [
                {
                    "name": a.name,
                    "start_date": a.start_date.isoformat() if a.start_date else None,
                    "end_date": a.end_date.isoformat() if a.end_date else None,
                    "completion_date": a.completion_date.isoformat() if a.completion_date else None,
                    "assignee": a.assignee or "",
                    "status": a.status or "review",
                    "notes": a.notes or "",
                    "order": a.order,
                }
                for a in activities
            ],
        })

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{project.name}_{ts}"
    backup = models.ProjectBackup(
        project_id=pid,
        name=backup_name,
        data=json.dumps(snapshot, ensure_ascii=False),
        created_by=current_user.id,
    )
    db.add(backup)
    db.commit()
    db.refresh(backup)
    return {
        "id": backup.id,
        "project_id": backup.project_id,
        "name": backup.name,
        "created_by_name": current_user.name,
        "created_at": backup.created_at,
    }


@app.post("/api/projects/{pid}/restore/{bid}")
async def restore_backup(
    pid: int,
    bid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == pid).first()
    if not project:
        raise HTTPException(404, "Project not found")
    require_master(pid, current_user, db)

    backup = db.query(models.ProjectBackup).filter(
        models.ProjectBackup.id == bid,
        models.ProjectBackup.project_id == pid,
    ).first()
    if not backup:
        raise HTTPException(404, "Backup not found")

    snapshot = json.loads(backup.data)

    # Delete all existing tech items (cascades to activities)
    db.query(models.TechItem).filter(models.TechItem.project_id == pid).delete()

    # Restore project meta
    project.name = snapshot["project_name"]
    project.description = snapshot.get("project_description", "")
    project.version += 1
    project.updated_at = datetime.now()

    # Recreate tech items and activities
    for ti_data in snapshot.get("tech_items", []):
        ti = models.TechItem(
            project_id=pid,
            name=ti_data["name"],
            description=ti_data.get("description", ""),
            order=ti_data.get("order", 0),
        )
        db.add(ti)
        db.flush()
        for a_data in ti_data.get("activities", []):
            from datetime import date as date_type
            def parse_date(s):
                return date_type.fromisoformat(s) if s else None
            a = models.Activity(
                tech_item_id=ti.id,
                name=a_data["name"],
                start_date=parse_date(a_data.get("start_date")),
                end_date=parse_date(a_data.get("end_date")),
                completion_date=parse_date(a_data.get("completion_date")),
                assignee=a_data.get("assignee", ""),
                status=a_data.get("status", "review"),
                notes=a_data.get("notes", ""),
                order=a_data.get("order", 0),
            )
            db.add(a)

    db.commit()
    await manager.broadcast({"type": "project_updated", "data": {"id": pid}})
    return {"ok": True}


@app.delete("/api/projects/{pid}/backups/{bid}")
def delete_backup(
    pid: int,
    bid: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_master(pid, current_user, db)
    backup = db.query(models.ProjectBackup).filter(
        models.ProjectBackup.id == bid,
        models.ProjectBackup.project_id == pid,
    ).first()
    if not backup:
        raise HTTPException(404, "Backup not found")
    db.delete(backup)
    db.commit()
    return {"ok": True}


# ─── Static frontend ──────────────────────────────────────────────────────────

_BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
_STATIC_DIR = os.path.join(_BASE_DIR, "static")

if os.path.isdir(_STATIC_DIR):
    _assets = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        index = os.path.join(_STATIC_DIR, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        return JSONResponse({"detail": "Frontend not built."}, status_code=503)
