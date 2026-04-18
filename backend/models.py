from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    tech_items = relationship("TechItem", back_populates="project", cascade="all, delete-orphan", order_by="TechItem.order")


class TechItem(Base):
    __tablename__ = "tech_items"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    order = Column(Integer, default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="tech_items")
    activities = relationship("Activity", back_populates="tech_item", cascade="all, delete-orphan", order_by="Activity.order")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    tech_item_id = Column(Integer, ForeignKey("tech_items.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    completion_date = Column(Date, nullable=True)
    assignee = Column(String(100), default="")
    status = Column(String(20), default="review")  # review, in_progress, complete
    notes = Column(Text, default="")
    order = Column(Integer, default=0)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

    tech_item = relationship("TechItem", back_populates="activities")
