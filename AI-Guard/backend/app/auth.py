from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Depends, Header, HTTPException, status
from passlib.context import CryptContext

from .config import get_settings

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

Settings = get_settings()

_USERS = {
    "admin":     {"user_id": "u-admin-001", "role": "admin",     "pw": Settings.ADMIN_PASSWORD},
    "sre_user":  {"user_id": "u-sre-001",   "role": "sre",       "pw": Settings.SRE_PASSWORD},
    "dev_user":  {"user_id": "u-dev-001",   "role": "developer", "pw": Settings.DEV_PASSWORD},
}


def verify_password(username: str, password: str) -> dict | None:
    user = _USERS.get(username)
    if not user:
        return None
    if user["pw"] != password:
        return None
    return {"user_id": user["user_id"], "role": user["role"]}


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "user_id": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=Settings.JWT_EXPIRATION)).timestamp()),
    }
    return jwt.encode(payload, Settings.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, Settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, {"error": "token_expired", "detail": "Token expired"})
    except jwt.InvalidTokenError:
        raise HTTPException(401, {"error": "unauthorized", "detail": "Invalid token"})


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, {"error": "unauthorized", "detail": "Missing token"})
    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    return {"user_id": payload["user_id"], "role": payload["role"]}


def require_roles(*roles: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                403,
                {"error": "forbidden", "detail": f"Требуется роль: {', '.join(roles)}"},
            )
        return user
    return _dep
