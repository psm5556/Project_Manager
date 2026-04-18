from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
