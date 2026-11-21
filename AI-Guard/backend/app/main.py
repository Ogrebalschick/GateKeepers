# main.py
import json
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
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
from .db_models import Check, PolicyVersion
from .policy import policy_store
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
    read=float(getattr(settings, "ML_TIMEOUT_SECONDS", 8.0)),
    write=2.0,
    pool=2.0,
)


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

    check_id = result["check_id"]

    # best-effort лог
    try:
        async with SessionLocal() as db:
            row = Check(
                check_id=check_id,
                user_prompt=req.user_prompt[:4000],
                context_json=json.dumps(
                    req.context.model_dump(), ensure_ascii=False
                )[:8000],
                user_role=req.context.user_role,
                user_id=req.context.user_id,
                user_name=req.context.user_name,
                decision=result["decision"],
                risk_level=result["risk_level"],
                risk_category=result["risk_category"],
                explanation=result["explanation"],
                latency_ms=latency_ms,
                pipeline_layer=result["pipeline_layer"],
                policy_version=policy_store.version,
                session_id=req.session_id,
            )
            db.add(row)
            await db.commit()
    except Exception as exc:
        print(f"[check] log error: {exc}")

    return CheckResponse(**result)


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
        await db.commit()
    return {"ok": True}


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
@app.get("/api/logs")
async def list_logs(
    decision: str = "",
    risk_level: str = "",
    risk_category: str = "",
    user_role: str = "",
    user_id: str = "",
    page: int = 1,
    per_page: int = 50,
    user: dict = Depends(get_current_user),
):
    page = max(1, page)
    per_page = min(max(1, per_page), 200)
    async with SessionLocal() as db:
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

        total = (await db.execute(
            select(func.count()).select_from(stmt.subquery())
        )).scalar_one()

        rows = (await db.execute(
            stmt.order_by(Check.id.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )).scalars().all()

    return {
        "items": [
            {
                "id": r.id,
                "check_id": r.check_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "user_prompt": (r.user_prompt or "")[:200],
                "user_role": r.user_role,
                "user_id": r.user_id,
                "user_name": r.user_name,
                "decision": r.decision,
                "risk_level": r.risk_level,
                "risk_category": r.risk_category,
                "explanation": r.explanation,
                "latency_ms": r.latency_ms,
                "pipeline_layer": r.pipeline_layer,
                "session_id": r.session_id,
                "policy_version": r.policy_version,
            }
            for r in rows
        ],
        "total": int(total),
        "page": page,
        "per_page": per_page,
        "pages": (int(total) + per_page - 1) // per_page,
    }


@app.get("/api/logs/export.csv")
async def export_logs(user: dict = Depends(require_roles("admin", "sre"))):
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(Check).order_by(Check.id.desc()).limit(10000)
        )).scalars().all()

    header = "id,created_at,user_role,decision,risk_level,risk_category,latency_ms,pipeline_layer\n"
    body = "".join(
        f'{r.id},{r.created_at},{r.user_role},{r.decision},{r.risk_level},'
        f'{r.risk_category},{r.latency_ms},{r.pipeline_layer}\n'
        for r in rows
    )

    async def gen():
        yield header
        yield body

    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="guard_logs.csv"'},
    )


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


@app.put("/api/policy")
async def update_policy(
    req: PolicyUpdateRequest,
    user: dict = Depends(require_roles("admin")),
):
    try:
        new_version = policy_store.apply(req.content_yaml)
    except Exception as exc:
        raise HTTPException(400, {"error": "invalid_yaml", "detail": str(exc)})

    async with SessionLocal() as db:
        # деактивируем старые
        active = (await db.execute(
            select(PolicyVersion).where(PolicyVersion.is_active.is_(True))
        )).scalars().all()
        for pv in active:
            pv.is_active = False
        db.add(
            PolicyVersion(
                version=new_version,
                content_yaml=req.content_yaml,
                updated_by=user["user_id"],
                comment=req.comment,
                is_active=True,
            )
        )
        await db.commit()

    return {
        "version": new_version,
        "content_yaml": req.content_yaml,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user["user_id"],
        "comment": req.comment,
        "reload_status": "ok",
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
