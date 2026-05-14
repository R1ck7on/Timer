import logging

import httpx

from app.config import settings

log = logging.getLogger(__name__)


def notify_session_recorded(session_id: int, user_email: str) -> None:
    if not settings.notifier_url:
        return
    try:
        httpx.post(
            f"{settings.notifier_url.rstrip('/')}/notify",
            json={"event": "session_recorded", "session_id": session_id, "user": user_email},
            timeout=3.0,
        )
    except Exception as e:
        log.warning("notifier unreachable: %s", e)
