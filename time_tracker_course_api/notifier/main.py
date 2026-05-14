from fastapi import FastAPI

app = FastAPI(title="Notifier microservice", version="1.0.0")


@app.post("/notify")
def notify(payload: dict):
    """Принимает JSON от основного API (заглушка уведомлений для курсового)."""
    return {"received": True, "payload_keys": list(payload.keys())}


@app.get("/health")
def health():
    return {"status": "ok"}
