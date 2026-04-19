from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List
import json
import os

from database import SessionLocal, engine, Base
import models
import schemas

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Project Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ─── Projects ────────────────────────────────────────────────────────────────

@app.get("/api/projects", response_model=List[schemas.ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.id).all()


@app.post("/api/projects", response_model=schemas.ProjectResponse, status_code=201)
async def create_project(body: schemas.ProjectCreate, db: Session = Depends(get_db)):
    obj = models.Project(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "project_created", "data": {"id": obj.id}})
    return obj


@app.put("/api/projects/{pid}", response_model=schemas.ProjectResponse)
async def update_project(pid: int, body: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Project).filter(models.Project.id == pid).first()
    if not obj:
        raise HTTPException(404, "Project not found")
    if obj.version != body.version:
        raise HTTPException(409, "Version conflict — please reload and retry")
    obj.name = body.name
    obj.description = body.description or ""
    obj.version += 1
    obj.updated_at = datetime.now()
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "project_updated", "data": {"id": pid}})
    return obj


@app.delete("/api/projects/{pid}")
async def delete_project(pid: int, db: Session = Depends(get_db)):
    obj = db.query(models.Project).filter(models.Project.id == pid).first()
    if not obj:
        raise HTTPException(404, "Project not found")
    db.delete(obj)
    db.commit()
    await manager.broadcast({"type": "project_deleted", "data": {"id": pid}})
    return {"ok": True}


# ─── Tech Items ───────────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/tech_items", response_model=List[schemas.TechItemResponse])
def list_tech_items(pid: int, db: Session = Depends(get_db)):
    return db.query(models.TechItem).filter(models.TechItem.project_id == pid).order_by(models.TechItem.order, models.TechItem.id).all()


@app.post("/api/tech_items", response_model=schemas.TechItemResponse, status_code=201)
async def create_tech_item(body: schemas.TechItemCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    obj = models.TechItem(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    await manager.broadcast({"type": "tech_item_created", "data": {"id": obj.id, "project_id": obj.project_id}})
    return obj


@app.put("/api/tech_items/{tid}", response_model=schemas.TechItemResponse)
async def update_tech_item(tid: int, body: schemas.TechItemUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.TechItem).filter(models.TechItem.id == tid).first()
    if not obj:
        raise HTTPException(404, "Tech item not found")
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
async def delete_tech_item(tid: int, db: Session = Depends(get_db)):
    obj = db.query(models.TechItem).filter(models.TechItem.id == tid).first()
    if not obj:
        raise HTTPException(404, "Tech item not found")
    project_id = obj.project_id
    db.delete(obj)
    db.commit()
    await manager.broadcast({"type": "tech_item_deleted", "data": {"id": tid, "project_id": project_id}})
    return {"ok": True}


# ─── Activities ───────────────────────────────────────────────────────────────

@app.get("/api/projects/{pid}/activities", response_model=List[schemas.ActivityResponse])
def list_project_activities(pid: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Activity)
        .join(models.TechItem)
        .filter(models.TechItem.project_id == pid)
        .order_by(models.TechItem.order, models.TechItem.id, models.Activity.order, models.Activity.id)
        .all()
    )


@app.get("/api/tech_items/{tid}/activities", response_model=List[schemas.ActivityResponse])
def list_tech_item_activities(tid: int, db: Session = Depends(get_db)):
    return db.query(models.Activity).filter(models.Activity.tech_item_id == tid).order_by(models.Activity.order, models.Activity.id).all()


@app.post("/api/activities", response_model=schemas.ActivityResponse, status_code=201)
async def create_activity(body: schemas.ActivityCreate, db: Session = Depends(get_db)):
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == body.tech_item_id).first()
    if not tech_item:
        raise HTTPException(404, "Tech item not found")
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
async def update_activity(aid: int, body: schemas.ActivityUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Activity).filter(models.Activity.id == aid).first()
    if not obj:
        raise HTTPException(404, "Activity not found")
    if obj.version != body.version:
        raise HTTPException(409, "Version conflict — please reload and retry")
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == body.tech_item_id).first()
    if not tech_item:
        raise HTTPException(404, "Tech item not found")
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
async def delete_activity(aid: int, db: Session = Depends(get_db)):
    obj = db.query(models.Activity).filter(models.Activity.id == aid).first()
    if not obj:
        raise HTTPException(404, "Activity not found")
    tech_item = db.query(models.TechItem).filter(models.TechItem.id == obj.tech_item_id).first()
    project_id = tech_item.project_id if tech_item else None
    tech_item_id = obj.tech_item_id
    db.delete(obj)
    db.commit()
    await manager.broadcast({
        "type": "activity_deleted",
        "data": {"id": aid, "tech_item_id": tech_item_id, "project_id": project_id},
    })
    return {"ok": True}


# ── Static frontend ───────────────────────────────────────────────────────────
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
