# main.py
import csv
import io
import json
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
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
            user_role=payload.get("user_role"),
            user_id=payload.get("user_id"),
            user_name=payload.get("user_name"),
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


# ---------------------- Stats ----------------------
@app.get("/api/stats")
async def stats(user: dict = Depends(require_roles("admin", "sre"))):
    async with SessionLocal() as db:
        total = (await db.scalar(select(func.count()).select_from(Check))) or 0
        by_decision = dict((await db.execute(
            select(Check.decision, func.count()).group_by(Check.decision)
        )).all())
        by_risk = dict((await db.execute(
            select(Check.risk_level, func.count()).group_by(Check.risk_level)
        )).all())

    return {
        "total_checks": int(total),
        "by_decision": by_decision,
        "by_risk_level": by_risk,
    }


# ---------------------- Exception handler ----------------------
@app.exception_handler(HTTPException)
async def http_exc_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "error", "detail": str(exc.detail)},
    )
