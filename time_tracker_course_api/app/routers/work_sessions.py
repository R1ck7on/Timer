from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Task, User, WorkSession
from app.notifier_client import notify_session_recorded
from app.schemas import WorkSessionCreate, WorkSessionOut, WorkSessionUpdate

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[WorkSessionOut])
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(WorkSession).where(WorkSession.user_id == user.id).order_by(WorkSession.id.desc())
    ).all()
    return list(rows)


@router.post("", response_model=WorkSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    body: WorkSessionCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.scalars(select(Task).where(Task.id == body.task_id, Task.user_id == user.id)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if body.ended_at_ms < body.started_at_ms:
        raise HTTPException(status_code=400, detail="ended_at_ms должно быть >= started_at_ms")
    ws = WorkSession(
        user_id=user.id,
        task_id=body.task_id,
        started_at_ms=body.started_at_ms,
        ended_at_ms=body.ended_at_ms,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)
    background_tasks.add_task(notify_session_recorded, ws.id, user.email)
    return ws


@router.get("/{session_id}", response_model=WorkSessionOut)
def get_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.scalars(
        select(WorkSession).where(WorkSession.id == session_id, WorkSession.user_id == user.id)
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    return ws


@router.patch("/{session_id}", response_model=WorkSessionOut)
def update_session(
    session_id: int,
    body: WorkSessionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.scalars(
        select(WorkSession).where(WorkSession.id == session_id, WorkSession.user_id == user.id)
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    if body.ended_at_ms < body.started_at_ms:
        raise HTTPException(status_code=400, detail="ended_at_ms должно быть >= started_at_ms")
    ws.started_at_ms = body.started_at_ms
    ws.ended_at_ms = body.ended_at_ms
    db.commit()
    db.refresh(ws)
    return ws


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ws = db.scalars(
        select(WorkSession).where(WorkSession.id == session_id, WorkSession.user_id == user.id)
    ).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    db.delete(ws)
    db.commit()
    return None
