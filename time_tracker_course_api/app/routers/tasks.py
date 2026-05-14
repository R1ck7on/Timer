from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Task, User
from app.schemas import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.id)).all()
    return list(rows)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = Task(user_id=user.id, name=body.name.strip())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.scalars(select(Task).where(Task.id == task_id, Task.user_id == user.id)).first()
    if not t:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return t


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.scalars(select(Task).where(Task.id == task_id, Task.user_id == user.id)).first()
    if not t:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    t.name = body.name.strip()
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.scalars(select(Task).where(Task.id == task_id, Task.user_id == user.id)).first()
    if not t:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    db.delete(t)
    db.commit()
    return None
