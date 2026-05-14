from fastapi.testclient import TestClient


def register_and_token(client: TestClient, email: str = "student@example.com", password: str = "pass12345"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    r = client.post("/auth/token", data={"username": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_register_and_login(client):
    r = client.post("/auth/register", json={"email": "a@b.com", "password": "longpass1"})
    assert r.status_code == 201
    assert r.json()["email"] == "a@b.com"

    r = client.post("/auth/register", json={"email": "a@b.com", "password": "longpass1"})
    assert r.status_code == 400

    r = client.post("/auth/token", data={"username": "a@b.com", "password": "wrong"})
    assert r.status_code == 401

    r = client.post("/auth/token", data={"username": "a@b.com", "password": "longpass1"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_tasks_crud_requires_auth(client):
    code = client.get("/tasks").status_code
    assert code in (401, 403)


def test_tasks_crud(client):
    h = register_and_token(client)
    assert client.get("/tasks", headers=h).json() == []

    r = client.post("/tasks", headers=h, json={"name": "  Курсовая  "})
    assert r.status_code == 201
    tid = r.json()["id"]
    assert r.json()["name"] == "  Курсовая  ".strip()

    r = client.get(f"/tasks/{tid}", headers=h)
    assert r.status_code == 200

    r = client.patch(f"/tasks/{tid}", headers=h, json={"name": "Диплом"})
    assert r.status_code == 200
    assert r.json()["name"] == "Диплом"

    r = client.delete(f"/tasks/{tid}", headers=h)
    assert r.status_code == 204
    assert client.get(f"/tasks/{tid}", headers=h).status_code == 404


def test_sessions_crud(client):
    h = register_and_token(client, email="u2@example.com", password="pass12345")
    tid = client.post("/tasks", headers=h, json={"name": "Задача"}).json()["id"]

    r = client.post(
        "/sessions",
        headers=h,
        json={"task_id": tid, "started_at_ms": 1000, "ended_at_ms": 5000},
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    r = client.get(f"/sessions/{sid}", headers=h)
    assert r.status_code == 200

    r = client.patch(f"/sessions/{sid}", headers=h, json={"started_at_ms": 2000, "ended_at_ms": 8000})
    assert r.status_code == 200
    assert r.json()["started_at_ms"] == 2000

    r = client.delete(f"/sessions/{sid}", headers=h)
    assert r.status_code == 204

    bad = client.post(
        "/sessions",
        headers=h,
        json={"task_id": 99999, "started_at_ms": 1, "ended_at_ms": 2},
    )
    assert bad.status_code == 404
