from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str
    knox_id: str
    pin: str  # 6-digit PIN


class UserLogin(BaseModel):
    knox_id: str
    pin: str


class UserResponse(BaseModel):
    id: int
    name: str
    knox_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserResponse


# ─── Projects ─────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectUpdate(BaseModel):
    name: str
    description: Optional[str] = ""
    version: int


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    version: int
    created_by: Optional[int]
    user_role: Optional[str]  # "master", "member", or None (legacy)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Tech Items ───────────────────────────────────────────────────────────────

class TechItemCreate(BaseModel):
    project_id: int
    name: str
    description: Optional[str] = ""
    order: Optional[int] = 0


class TechItemUpdate(BaseModel):
    name: str
    description: Optional[str] = ""
    order: Optional[int] = 0
    version: int


class TechItemResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: str
    order: int
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Activities ───────────────────────────────────────────────────────────────

class ActivityCreate(BaseModel):
    tech_item_id: int
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completion_date: Optional[date] = None
    assignee: Optional[str] = ""
    status: Optional[str] = "review"
    notes: Optional[str] = ""
    order: Optional[int] = 0


class ActivityUpdate(BaseModel):
    tech_item_id: int
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completion_date: Optional[date] = None
    assignee: Optional[str] = ""
    status: Optional[str] = "review"
    notes: Optional[str] = ""
    order: Optional[int] = 0
    version: int


class ActivityResponse(BaseModel):
    id: int
    tech_item_id: int
    name: str
    start_date: Optional[date]
    end_date: Optional[date]
    completion_date: Optional[date]
    assignee: str
    status: str
    notes: str
    order: int
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("assignee", "status", "notes", mode="before")
    @classmethod
    def coerce_none_to_empty(cls, v: object) -> str:
        return v if v is not None else ""


# ─── Members ──────────────────────────────────────────────────────────────────

class MemberResponse(BaseModel):
    id: int
    user_id: int
    name: str
    knox_id: str
    role: str  # master, member
    created_at: datetime

    model_config = {"from_attributes": True}


class AddMemberRequest(BaseModel):
    knox_id: str
    role: Optional[str] = "member"  # master, member


class UpdateMemberRoleRequest(BaseModel):
    role: str  # master, member


# ─── Backups ──────────────────────────────────────────────────────────────────

class BackupResponse(BaseModel):
    id: int
    project_id: int
    name: str
    created_by_name: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
