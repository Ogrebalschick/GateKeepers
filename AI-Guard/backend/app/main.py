# main.py
import csv
import io
import json
import math
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func, select

from .auth import (
    create_access_token,
    get_current_user,
    require_roles,
    verify_password,
)
from .config import get_settings
from .database import SessionLocal, init_db
from .db_models import Check, CheckSession, GuardSession, PolicyVersion
from .policy import (
    PolicySchemaError,
    PolicyYAMLError,
    normalize_policy_yaml,
    parse_policy_for_save,
    policy_store,
)
from .schemas import (
    DECISIONS,
    RISK_CATEGORIES,
    RISK_LEVELS,
    CheckRequest,
    CheckResponse,
    ConfirmRequest,
    LoginRequest,
    LoginResponse,
    PolicyUpdateRequest,
    SessionCreateRequest,
)

settings = get_settings()

# ---------- ML-клиент ----------
_http_client: httpx.AsyncClient | None = None
ML_TIMEOUT = httpx.Timeout(
    connect=2.0,
    read=float(settings.ML_TIMEOUT_SECONDS),
    write=2.0,
    pool=2.0,
)

# ---------- ML-ответчик ----------
_ml_response_cache: dict[str, Any] = {}



@asynccontextmanager
async def lifespan(app: FastAPI):
    global _http_client
    _http_client = httpx.AsyncClient(timeout=ML_TIMEOUT)
    try:
        await init_db()
    except Exception as exc:
        print(f"[startup] DB init failed: {exc}")
    try:
        await _bootstrap_policy()
    except Exception as exc:
        print(f"[startup] policy bootstrap failed: {exc}")
    yield
    if _http_client:
        await _http_client.aclose()


app = FastAPI(title="AstraGuard", version=settings.VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)


async def _bootstrap_policy() -> None:
    async with SessionLocal() as db:
        existing = await db.scalar(
            select(PolicyVersion).where(PolicyVersion.is_active.is_(True))
        )
        if existing:
            policy_store.apply(existing.content_yaml)
            return
        pv = PolicyVersion(
            version=policy_store.version,
            content_yaml=policy_store.raw_yaml,
            updated_by="system",
            comment="initial bootstrap",
            is_active=True,
        )
        db.add(pv)
        await db.commit()


# ---------- Нормализация ML-ответа под схему CheckResponse ----------
def _fallback(reason: str, latency_ms: float) -> dict:
    """Fail-safe: если ML недоступен/вернул мусор — block (пропуск опаснее)."""
    return {
        "decision": "block",
        "risk_level": "high",
        "risk_category": "none",
        "explanation": (
            f"ML-сервис недоступен или вернул некорректный ответ ({reason}). "
            f"Запрос заблокирован по fail-safe."
        ),
        "latency_ms": round(latency_ms, 2),
        "pipeline_layer": "fallback",
        "check_id": str(uuid.uuid4()),
    }


def _normalize_ml_response(raw: Any, fallback_latency_ms: float) -> dict:
    """
    Приводит ответ ML к контракту CheckResponse.
    Валидные множества берутся из schemas.py (Literal → get_args).
    Любое несоответствие → безопасный дефолт, чтобы response_model не упал 500-й.
    """
    if not isinstance(raw, dict):
        return _fallback("ответ ML не является JSON-объектом", fallback_latency_ms)

    decision = str(raw.get("decision", "")).lower().strip()
    if decision not in DECISIONS:
        return _fallback(
            f"неизвестный decision={decision!r}", fallback_latency_ms
        )

    risk_level = str(raw.get("risk_level", "none")).lower().strip()
    if risk_level not in RISK_LEVELS:
        risk_level = "medium"  # безопасный дефолт

    risk_category = str(raw.get("risk_category", "none")).strip()
    if risk_category not in RISK_CATEGORIES:
        risk_category = "none"

    explanation = str(raw.get("explanation", "")).strip()
    if not explanation:
        explanation = f"Решение ML: {decision}"

    pipeline_layer = str(raw.get("pipeline_layer", "layer0")).strip() or "layer0"

    try:
        latency_ms = float(raw.get("latency_ms", fallback_latency_ms))
    except (TypeError, ValueError):
        latency_ms = fallback_latency_ms

    check_id = str(raw.get("check_id") or uuid.uuid4())

    return {
        "decision": decision,
        "risk_level": risk_level,
        "risk_category": risk_category,
        "explanation": explanation,
        "latency_ms": round(latency_ms, 2),
        "pipeline_layer": pipeline_layer,
        "check_id": check_id,
    }


# ---------- Health ----------
@app.get("/health")
async def health():
    ml_ok = False
    try:
        if _http_client:
            r = await _http_client.get(
                f"{settings.ML_SERVICE_URL}/health", timeout=2.0
            )
            ml_ok = r.status_code == 200
    except Exception:
        pass
    return {
        "status": "ok",
        "version": settings.VERSION,
        "policy_version": policy_store.version,
        "ml_service_reachable": ml_ok,
    }


# ---------- /v1/check — шлюз к ML ----------
@app.post("/v1/check", response_model=CheckResponse)
async def check(req: CheckRequest):
    t0 = time.perf_counter()

    payload = {
        "user_prompt": req.user_prompt,
        "context": req.context.model_dump(),
        "session_id": req.session_id,
    }

    raw_response: Any = None
    try:
        if _http_client is None:
            raise RuntimeError("http client not initialized")
        r = await _http_client.post(
            f"{settings.ML_SERVICE_URL}/v1/check",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 200:
            raw_response = r.json()
        else:
            print(f"[check] ML non-200: {r.status_code} {r.text[:200]}")
    except httpx.TimeoutException:
        print("[check] ML timeout")
    except Exception as exc:
        print(f"[check] ML error: {exc}")

    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    if raw_response is None:
        result = _fallback("нет ответа от ML", latency_ms)
    else:
        result = _normalize_ml_response(raw_response, latency_ms)
        # latency_ms в ответе — полная латентность шлюза (организаторы всё равно перезаписывают)
        result["latency_ms"] = latency_ms

    # Журнал пишет только POST /internal/checks (вызов из ml-service).
    return CheckResponse(**result)


def _identity_field(payload: dict, key: str) -> str:
    """user_id / user_role / user_name: верхний уровень, иначе context, иначе context_json. Не NULL."""
    value = payload.get(key)
    if value is None:
        context = payload.get("context")
        if isinstance(context, dict):
            value = context.get(key)
    if value is None:
        raw = payload.get("context_json")
        parsed: Any = None
        if isinstance(raw, dict):
            parsed = raw
        elif isinstance(raw, str) and raw.strip():
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                parsed = None
        if isinstance(parsed, dict):
            value = parsed.get(key)
    if value is None:
        return ""
    return str(value)


def _append_threat_flag(raw: str | None, flag: str) -> str:
    try:
        flags = json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        flags = []
    if not isinstance(flags, list):
        flags = []
    if flag not in flags:
        flags.append(flag)
    return json.dumps(flags, ensure_ascii=False)


# ---------- /internal/checks (ML → backend, идемпотентно) ----------
@app.post("/internal/checks", status_code=201)
async def internal_checks(payload: dict):
    check_id = payload.get("check_id")
    if not check_id:
        raise HTTPException(400, {"error": "invalid_input", "detail": "check_id required"})
    async with SessionLocal() as db:
        existing = await db.scalar(select(Check).where(Check.check_id == check_id))
        if existing:
            return {"ok": True, "duplicated": True}
        is_multi = False
        session_id = (payload.get("session_id") or "").strip()
        session = None
        if session_id:
            session = await db.scalar(
                select(GuardSession).where(GuardSession.session_id == session_id)
            )
        row = Check(
            check_id=check_id,
            user_prompt=(payload.get("user_prompt") or "")[:4000],
            context_json=(payload.get("context_json") or "{}")[:8000],
            user_role=_identity_field(payload, "user_role"),
            user_id=_identity_field(payload, "user_id"),
            user_name=_identity_field(payload, "user_name"),
            decision=payload.get("decision"),
            risk_level=payload.get("risk_level"),
            risk_category=payload.get("risk_category"),
            explanation=payload.get("explanation"),
            latency_ms=payload.get("latency_ms"),
            pipeline_layer=payload.get("pipeline_layer"),
            policy_version=payload.get("policy_version"),
            session_id=payload.get("session_id"),
        )
        db.add(row)
        if session is not None and session.status != "closed":
            previous = (
                await db.execute(
                    select(Check.decision)
                    .join(CheckSession, CheckSession.check_id == Check.check_id)
                    .where(CheckSession.session_id == session.session_id)
                    .order_by(CheckSession.message_index.desc())
                    .limit(2)
                )
            ).scalars().all()
            decision = payload.get("decision")
            is_multi = (
                decision == "block"
                and len(previous) >= 2
                and all(item == "block" for item in previous)
            )
            last_index = await db.scalar(
                select(func.max(CheckSession.message_index)).where(
                    CheckSession.session_id == session.session_id
                )
            )
            db.add(
                CheckSession(
                    session_id=session.session_id,
                    check_id=check_id,
                    message_index=int(last_index or 0) + 1,
                    is_multi_step_attack=is_multi,
                )
            )
            session.request_count = int(session.request_count or 0) + 1
            session.last_activity_at = datetime.now(timezone.utc).replace(tzinfo=None)
            if is_multi:
                session.threat_flags_json = _append_threat_flag(
                    session.threat_flags_json, "multi_step_attack"
                )
            if session.request_count >= int(session.max_requests or 0):
                session.status = "closed"
        await db.commit()
    return {"ok": True, "is_multi_step_attack": is_multi}


# ---------- /internal/reload-policy (backend → ML) ----------
@app.post("/internal/reload-policy")
async def reload_policy(payload: dict):
    if _http_client is None:
        raise HTTPException(503, {"error": "ml_unavailable"})
    try:
        r = await _http_client.post(
            f"{settings.ML_SERVICE_URL}/internal/reload-policy",
            json=payload,
            timeout=5.0,
        )
        return r.json()
    except Exception as exc:
        raise HTTPException(503, {"error": "ml_unavailable", "detail": str(exc)})




# ---------------------- Auth ----------------------
@app.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = verify_password(req.username, req.password)
    if not user:
        raise HTTPException(
            401,
            {"error": "invalid_credentials", "detail": "Неверный логин или пароль"},
        )
    token = create_access_token(user["user_id"], user["role"])
    return LoginResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRATION,
        user_id=user["user_id"],
        role=user["role"],
    )


# ---------------------- Logs ----------------------
def _parse_log_datetime(value: str, *, end_of_day: bool) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    date_only = len(raw) == 10
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            400, {"error": "invalid_input", "detail": f"invalid date: {value}"}
        ) from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    if date_only and end_of_day:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    if date_only:
        return parsed.replace(hour=0, minute=0, second=0, microsecond=0)
    if end_of_day and parsed.hour == parsed.minute == parsed.second == parsed.microsecond == 0:
        return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed


def _logs_filters(
    *,
    decision: str,
    risk_level: str,
    risk_category: str,
    user_role: str,
    user_id: str,
    date_from: str,
    date_to: str,
    search: str,
    user: dict,
):
    stmt = select(Check)
    if user["role"] == "developer":
        stmt = stmt.where(Check.user_id == user["user_id"])
    elif user_id:
        stmt = stmt.where(Check.user_id == user_id)
    if decision:
        stmt = stmt.where(Check.decision == decision)
    if risk_level:
        stmt = stmt.where(Check.risk_level == risk_level)
    if risk_category:
        stmt = stmt.where(Check.risk_category == risk_category)
    if user_role:
        stmt = stmt.where(Check.user_role == user_role)
    start = _parse_log_datetime(date_from, end_of_day=False)
    end = _parse_log_datetime(date_to, end_of_day=True)
    if start is not None:
        stmt = stmt.where(Check.created_at >= start)
    if end is not None:
        stmt = stmt.where(Check.created_at <= end)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Check.user_prompt.like(f"%{escaped}%", escape="\\"))
    return stmt


def _confirm_status(row: Check) -> str:
    return row.confirmation_status or "pending"


def _has_attachments(context_json: str | None) -> bool:
    if not context_json:
        return False
    try:
        data = json.loads(context_json)
    except (json.JSONDecodeError, TypeError):
        return False
    if not isinstance(data, dict):
        return False
    attachments = data.get("attachments")
    return isinstance(attachments, list) and len(attachments) > 0


def _log_context(row: Check) -> dict:
    data: dict = {}
    try:
        parsed = json.loads(row.context_json or "")
        if isinstance(parsed, dict):
            data = parsed
    except (json.JSONDecodeError, TypeError):
        data = {}
    history = data.get("history")
    attachments = data.get("attachments")
    history_items = history if isinstance(history, list) else []
    attachment_items = attachments if isinstance(attachments, list) else []
    previews = []
    for item in attachment_items:
        if not isinstance(item, dict):
            continue
        previews.append({
            "type": str(item.get("type") or ""),
            "name": str(item.get("name") or ""),
            "content_preview": str(item.get("content") or "")[:500],
        })
    return {
        "target_agent": str(data.get("target_agent") or ""),
        "user_role": str(data.get("user_role") or row.user_role or ""),
        "user_id": str(data.get("user_id") or row.user_id or ""),
        "user_name": str(data.get("user_name") or row.user_name or ""),
        "history_count": len(history_items),
        "attachments_count": len(previews),
        "attachments": previews,
    }


def _log_list_item(row: Check) -> dict:
    return {
        "id": row.id,
        "check_id": row.check_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "user_prompt": (row.user_prompt or "")[:200],
        "user_role": row.user_role,
        "user_id": row.user_id,
        "user_name": row.user_name,
        "decision": row.decision,
        "risk_level": row.risk_level,
        "risk_category": row.risk_category,
        "explanation": row.explanation,
        "latency_ms": row.latency_ms,
        "pipeline_layer": row.pipeline_layer,
        "has_attachments": _has_attachments(row.context_json),
        "session_id": row.session_id,
        "policy_version": row.policy_version,
        "confirm_status": _confirm_status(row),
    }


@app.get("/api/logs")
async def list_logs(
    decision: str = "",
    risk_level: str = "",
    risk_category: str = "",
    user_role: str = "",
    user_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(get_current_user),
):
    page = max(1, page)
    per_page = min(max(1, per_page), 200)
    stmt = _logs_filters(
        decision=decision,
        risk_level=risk_level,
        risk_category=risk_category,
        user_role=user_role,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
        user=user,
    )
    async with SessionLocal() as db:
        total = (await db.execute(
            select(func.count()).select_from(stmt.subquery())
        )).scalar_one()
        rows = (await db.execute(
            stmt.order_by(Check.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )).scalars().all()

    total = int(total)
    return {
        "items": [_log_list_item(row) for row in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@app.get("/api/logs/export.csv")
async def export_logs(
    decision: str = "",
    risk_level: str = "",
    risk_category: str = "",
    user_role: str = "",
    user_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    user: dict = Depends(require_roles("admin", "sre")),
):
    stmt = _logs_filters(
        decision=decision,
        risk_level=risk_level,
        risk_category=risk_category,
        user_role=user_role,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        search=search,
        user=user,
    )
    async with SessionLocal() as db:
        rows = (await db.execute(stmt.order_by(Check.id.desc()))).scalars().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "created_at", "user_role", "decision",
        "risk_level", "risk_category", "latency_ms", "pipeline_layer",
    ])
    for row in rows:
        writer.writerow([
            row.id,
            row.created_at.isoformat() if row.created_at else "",
            row.user_role,
            row.decision,
            row.risk_level,
            row.risk_category,
            row.latency_ms,
            row.pipeline_layer,
        ])
    filename = f"guard_logs_{datetime.now(timezone.utc).date().isoformat()}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/logs/{log_id}")
async def get_log(log_id: int, user: dict = Depends(get_current_user)):
    async with SessionLocal() as db:
        row = await db.get(Check, log_id)
    if row is None:
        raise HTTPException(404, {"error": "not_found"})
    if user["role"] == "developer" and row.user_id != user["user_id"]:
        raise HTTPException(403, {"error": "forbidden"})
    return {
        "id": row.id,
        "check_id": row.check_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "user_prompt": row.user_prompt or "",
        "context": _log_context(row),
        "decision": row.decision,
        "risk_level": row.risk_level,
        "risk_category": row.risk_category,
        "explanation": row.explanation,
        "latency_ms": row.latency_ms,
        "pipeline_layer": row.pipeline_layer,
        "policy_version": row.policy_version,
        "session_id": row.session_id,
        "confirm_status": _confirm_status(row),
    }


# ---------------------- Confirm ----------------------
@app.post("/api/confirm")
async def confirm(req: ConfirmRequest, user: dict = Depends(get_current_user)):
    async with SessionLocal() as db:
        row = await db.scalar(select(Check).where(Check.check_id == req.check_id))
        if not row:
            raise HTTPException(404, {"error": "check_not_found"})
        if row.confirmation_status:
            raise HTTPException(
                409,
                {
                    "error": "already_confirmed",
                    "detail": f"Confirmed at {row.confirmed_at}",
                },
            )
        row.confirmation_status = req.user_decision
        row.confirmed_at = datetime.now(timezone.utc)
        row.confirmed_by = user["user_id"]
        await db.commit()
        return {
            "check_id": row.check_id,
            "user_decision": req.user_decision,
            "confirmed_at": row.confirmed_at.isoformat(),
            "confirmed_by": row.confirmed_by,
        }


# ---------------------- Policy ----------------------

async def _send_policy_to_ml(payload: dict) -> bool:
    """Отправляет новую политику в ML-service."""

    if _http_client is None:
        return False

    try:
        response = await _http_client.post(
            f"{settings.ML_SERVICE_URL}/internal/reload-policy",
            json=payload,
            timeout=5.0,
        )

        return response.status_code == 200

    except (httpx.HTTPError, Exception) as exc:
        print(f"[policy] ML reload failed: {exc}")
        return False



@app.get("/api/policy")
async def get_policy(user: dict = Depends(require_roles("admin", "sre"))):
    async with SessionLocal() as db:
        row = await db.scalar(
            select(PolicyVersion).where(PolicyVersion.is_active.is_(True))
        )
    if not row:
        return {
            "version": policy_store.version,
            "content_yaml": policy_store.raw_yaml,
            "created_at": None,
            "updated_at": None,
            "updated_by": "system",
            "comment": None,
        }
    return {
        "version": row.version,
        "content_yaml": row.content_yaml,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.created_at.isoformat() if row.created_at else None,
        "updated_by": row.updated_by,
        "comment": row.comment,
    }



async def _insert_policy_version(
    content_yaml: str,
    user_id: str,
    comment: str | None,
) -> tuple[int, str, str]:
    """next_version берётся из max(version) в этой же транзакции."""
    for _attempt in range(3):
        try:
            async with SessionLocal() as db:
                (
                    await db.execute(select(PolicyVersion).with_for_update())
                ).scalars().all()
                current_max = await db.scalar(select(func.max(PolicyVersion.version)))
                next_version = int(current_max or 0) + 1
                normalized = normalize_policy_yaml(content_yaml, next_version)
                active = (
                    await db.execute(
                        select(PolicyVersion).where(PolicyVersion.is_active.is_(True))
                    )
                ).scalars().all()
                for row in active:
                    row.is_active = False
                created = PolicyVersion(
                    version=next_version,
                    content_yaml=normalized,
                    updated_by=user_id,
                    comment=comment,
                    is_active=True,
                )
                db.add(created)
                await db.commit()
                await db.refresh(created)
                updated_at = (
                    created.created_at.isoformat()
                    if created.created_at
                    else datetime.now(timezone.utc).isoformat()
                )
                return next_version, normalized, updated_at
        except IntegrityError:
            continue
    raise HTTPException(409, {"error": "version_conflict"})


@app.put("/api/policy")
async def update_policy(
    req: PolicyUpdateRequest,
    user: dict = Depends(require_roles("admin")),
):
    try:
        parse_policy_for_save(req.content_yaml)
    except PolicyYAMLError as exc:
        raise HTTPException(
            400,
            {
                "error": "invalid_yaml",
                "detail": str(exc),
            },
        )
    except PolicySchemaError as exc:
        raise HTTPException(
            422,
            {
                "error": "schema_violation",
                "detail": str(exc),
            },
        )

    next_version, normalized, updated_at = await _insert_policy_version(
        req.content_yaml,
        user["user_id"],
        req.comment,
    )
    policy_store.apply(normalized)
    reload_ok = await _send_policy_to_ml(
        {
            "content_yaml": normalized,
            "version": next_version,
        }
    )
    return {
        "version": next_version,
        "content_yaml": normalized,
        "updated_at": updated_at,
        "updated_by": user["user_id"],
        "comment": req.comment,
        "reload_status": "ok" if reload_ok else "failed",
    }

@app.get("/api/policy/history")
async def policy_history(user: dict = Depends(require_roles("admin", "sre"))):
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(PolicyVersion).order_by(PolicyVersion.version.desc())
        )).scalars().all()
    return {
        "items": [
            {
                "version": r.version,
                "updated_at": r.created_at.isoformat() if r.created_at else None,
                "updated_by": r.updated_by,
                "comment": r.comment,
                "is_active": r.is_active,
            }
            for r in rows
        ]
    }


# ---------------------- Sessions ----------------------
def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _threat_flags(raw: str | None) -> list[str]:
    try:
        flags = json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(flags, list):
        return []
    return [item for item in flags if isinstance(item, str)]


def _session_item(row: GuardSession) -> dict:
    return {
        "id": row.id,
        "session_id": row.session_id,
        "created_at": _iso(row.created_at),
        "user_id": row.user_id,
        "user_role": row.user_role,
        "max_requests": row.max_requests,
        "request_count": row.request_count,
        "status": row.status,
        "last_activity_at": _iso(row.last_activity_at),
        "threat_flags": _threat_flags(row.threat_flags_json),
    }


def _session_message(link: CheckSession, check: Check) -> dict:
    prompt = check.user_prompt or ""
    return {
        "id": link.id,
        "message_index": link.message_index,
        "check_id": check.check_id,
        "created_at": _iso(check.created_at),
        "user_prompt": prompt[:300],
        "decision": check.decision,
        "risk_level": check.risk_level,
        "risk_category": check.risk_category,
        "explanation": check.explanation,
        "latency_ms": check.latency_ms,
        "pipeline_layer": check.pipeline_layer,
        "is_multi_step_attack": bool(link.is_multi_step_attack),
    }


@app.get("/api/sessions")
async def list_sessions(
    status: str = "",
    user_id: str = "",
    page: int = 1,
    per_page: int = 20,
    user: dict = Depends(require_roles("admin", "sre", "developer")),
):
    page = page if page >= 1 else 1
    per_page = per_page if per_page >= 1 else 20
    stmt = select(GuardSession)
    if user["role"] == "developer":
        stmt = stmt.where(GuardSession.user_id == user["user_id"])
    elif user_id:
        stmt = stmt.where(GuardSession.user_id == user_id)
    if status:
        stmt = stmt.where(GuardSession.status == status)
    async with SessionLocal() as db:
        total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
        rows = (
            await db.execute(
                stmt.order_by(GuardSession.created_at.desc(), GuardSession.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).scalars().all()
    pages = (total + per_page - 1) // per_page if total else 0
    return {
        "items": [_session_item(row) for row in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }


@app.post("/api/sessions", status_code=201)
async def create_session(
    body: SessionCreateRequest,
    user: dict = Depends(require_roles("admin", "sre", "developer")),
):
    if user["role"] == "developer":
        owner = user["user_id"]
    else:
        owner = (body.user_id or "").strip() or user["user_id"]
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    row = GuardSession(
        session_id=str(uuid.uuid4()),
        user_id=owner,
        user_role=user["role"],
        status="active",
        request_count=0,
        max_requests=body.max_requests if body.max_requests is not None else 100,
        created_at=now,
        last_activity_at=now,
        threat_flags_json="[]",
    )
    async with SessionLocal() as db:
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return _session_item(row)


@app.get("/api/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: dict = Depends(require_roles("admin", "sre", "developer")),
):
    async with SessionLocal() as db:
        row = await db.scalar(
            select(GuardSession).where(GuardSession.session_id == session_id)
        )
        if row is None:
            raise HTTPException(404, {"error": "session_not_found"})
        if user["role"] == "developer" and row.user_id != user["user_id"]:
            raise HTTPException(403, {"error": "forbidden"})
        pairs = (
            await db.execute(
                select(CheckSession, Check)
                .join(Check, Check.check_id == CheckSession.check_id)
                .where(CheckSession.session_id == session_id)
                .order_by(CheckSession.message_index.asc())
            )
        ).all()
    item = _session_item(row)
    item["messages"] = [_session_message(link, check) for link, check in pairs]
    return item


# ---------------------- Stats ----------------------
_STAT_DECISIONS = ("allow", "confirm", "block")
_STAT_RISK_LEVELS = ("none", "low", "medium", "high", "critical")
_STAT_LAYERS = ("layer0", "layer1", "layer2")


def _utc_naive_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _hour_floor(value: datetime) -> datetime:
    value = _as_utc_naive(value)
    return value.replace(minute=0, second=0, microsecond=0)


def _hour_iso(value: datetime) -> str:
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(ratio * len(ordered)) - 1))
    return round(float(ordered[index]), 1)


@app.get("/api/stats")
async def stats(
    period_hours: int = Query(24, ge=1),
    user: dict = Depends(require_roles("admin", "sre")),
):
    now = _utc_naive_now()
    start = now - timedelta(hours=period_hours)
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(
                    Check.decision,
                    Check.risk_level,
                    Check.risk_category,
                    Check.latency_ms,
                    Check.pipeline_layer,
                ).where(Check.created_at >= start)
            )
        ).all()

    by_decision = {key: 0 for key in _STAT_DECISIONS}
    by_risk = {key: 0 for key in _STAT_RISK_LEVELS}
    by_layer = {key: 0 for key in _STAT_LAYERS}
    categories: dict[str, int] = {}
    latencies: list[float] = []

    for decision, risk_level, risk_category, latency_ms, pipeline_layer in rows:
        if decision in by_decision:
            by_decision[decision] += 1
        if risk_level in by_risk:
            by_risk[risk_level] += 1
        layer = (pipeline_layer or "").strip()
        if layer:
            by_layer[layer] = by_layer.get(layer, 0) + 1
        category = (risk_category or "").strip()
        if category:
            categories[category] = categories.get(category, 0) + 1
        if latency_ms is not None:
            latencies.append(float(latency_ms))

    top_categories = [
        {"category": category, "count": count}
        for category, count in sorted(categories.items(), key=lambda item: (-item[1], item[0]))
    ][:10]

    return {
        "total_checks": len(rows),
        "period_hours": period_hours,
        "by_decision": by_decision,
        "by_risk_level": by_risk,
        "by_pipeline_layer": by_layer,
        "top_categories": top_categories,
        "latency_p50_ms": _percentile(latencies, 0.50),
        "latency_p95_ms": _percentile(latencies, 0.95),
        "latency_p99_ms": _percentile(latencies, 0.99),
    }


@app.get("/api/stats/timeline")
async def stats_timeline(
    hours: int = Query(24, ge=1, le=168),
    user: dict = Depends(require_roles("admin", "sre")),
):
    current_hour = _hour_floor(_utc_naive_now())
    bucket_starts = [
        current_hour - timedelta(hours=hours - 1 - offset) for offset in range(hours)
    ]
    buckets = {
        start: {"allow": 0, "confirm": 0, "block": 0, "total": 0, "latency_sum": 0.0}
        for start in bucket_starts
    }
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Check.created_at, Check.decision, Check.latency_ms).where(
                    Check.created_at >= bucket_starts[0]
                )
            )
        ).all()

    for created_at, decision, latency_ms in rows:
        if created_at is None:
            continue
        bucket = buckets.get(_hour_floor(created_at))
        if bucket is None:
            continue
        bucket["total"] += 1
        if decision in ("allow", "confirm", "block"):
            bucket[decision] += 1
        if latency_ms is not None:
            bucket["latency_sum"] += float(latency_ms)

    items = []
    for start in bucket_starts:
        bucket = buckets[start]
        total = bucket["total"]
        items.append({
            "hour": _hour_iso(start),
            "allow": bucket["allow"],
            "confirm": bucket["confirm"],
            "block": bucket["block"],
            "total": total,
            "avg_latency_ms": round(bucket["latency_sum"] / total, 1) if total else 0,
        })
    return {"items": items}


# ---------------------- Exception handler ----------------------
@app.exception_handler(HTTPException)
async def http_exc_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "error", "detail": str(exc.detail)},
    )
