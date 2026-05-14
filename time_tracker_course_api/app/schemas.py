from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class UserOut(BaseModel):
    id: int
    email: EmailStr

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginBody(BaseModel):
    """Вход по JSON, если окно Authorize (OAuth2) в Swagger выдаёт ошибку."""

    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class TaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)


class TaskUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=500)


class TaskOut(BaseModel):
    id: int
    user_id: int
    name: str

    model_config = {"from_attributes": True}


class WorkSessionCreate(BaseModel):
    task_id: int
    started_at_ms: int
    ended_at_ms: int


class WorkSessionUpdate(BaseModel):
    started_at_ms: int
    ended_at_ms: int


class WorkSessionOut(BaseModel):
    id: int
    user_id: int
    task_id: int
    started_at_ms: int
    ended_at_ms: int

    model_config = {"from_attributes": True}
