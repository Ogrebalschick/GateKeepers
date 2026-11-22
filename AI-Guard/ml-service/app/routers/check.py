import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import (
    BACKEND_URL, MAX_INPUT_CHARS, MAX_HISTORY_ITEMS, MAX_ATTACHMENT_ITEMS,
    MAX_HISTORY_ITEM_CHARS, MAX_ATTACHMENT_CHARS, MAX_CONTEXT_CHARS,
)
from app.pipeline.engine import evaluate_request
from app.schemas import CheckRequest, CheckResponse
from app.utils.policy_loader import get_version

router = APIRouter()
logger = logging.getLogger("astra_guard.ml")

_SECRET_PATTERNS = [
    (re.compile(r"(?i)(password|passwd|пароль)(\s*(?:[:=]|is|это)\s*)[^\s,;]+"), r"\1\2[REDACTED]"),
    (re.compile(r"(?i)(token|api[_-]?key|secret|ключ|токен|client_secret|db_password|database_url)(\s*(?:[:=]|is|это)\s*)[^\s,;]+"), r"\1\2[REDACTED]"),
    (re.compile(r"(?i)(aws_secret_access_key\s*[:=]\s*)[A-Za-z0-9/+=]{24,}"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)[A-Za-z0-9._~+/=-]+"), r"\1[REDACTED]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED_AWS_ACCESS_KEY_ID]"),
    (re.compile(r"\b(?:ghp_|github_pat_|xox[baprs]-|sk_live_|sk_test_)[A-Za-z0-9_-]{12,}\b"), "[REDACTED_TOKEN]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"), "[REDACTED_JWT]"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "[REDACTED_PRIVATE_KEY]"),
]


def _format_explanation(value: str) -> str:
    words = str(value).strip().split()
    if len(words) < 10:
        words.extend("Решение принято до передачи запроса целевому агенту.".split())
    return " ".join(words[:50])


def _mask(value: str) -> str:
    result = value
    for pattern, replacement in _SECRET_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def _masked_context(context: dict) -> dict:
    result = dict(context)
    result["system_prompt"] = "[MASKED]" if result.get("system_prompt") else ""
    result["history"] = [
        {**item, "content": _mask(str(item.get("content", "")))}
        for item in result.get("history", [])
    ]
    result["attachments"] = [
        {**item, "content": _mask(str(item.get("content", "")))}
        for item in result.get("attachments", [])
    ]
    return result


async def _send_backend_log(payload: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.post(f"{BACKEND_URL}/internal/checks", json=payload)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else None
    except httpx.HTTPError as exc:
        logger.warning("Backend log delivery failed: %s", exc.__class__.__name__)
        return None


@router.post("/v1/check", response_model=CheckResponse)
async def check(request: CheckRequest):
    started = time.perf_counter()
    if len(request.user_prompt) > MAX_INPUT_CHARS:
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"user_prompt exceeds {MAX_INPUT_CHARS} characters"})
    if len(request.context.history) > MAX_HISTORY_ITEMS:
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"history exceeds {MAX_HISTORY_ITEMS} items"})
    if len(request.context.attachments) > MAX_ATTACHMENT_ITEMS:
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"attachments exceeds {MAX_ATTACHMENT_ITEMS} items"})
    history_chars = sum(len(item.content) for item in request.context.history)
    attachment_chars = sum(len(item.content) for item in request.context.attachments)
    system_prompt_chars = len(request.context.system_prompt)
    if any(len(item.content) > MAX_HISTORY_ITEM_CHARS for item in request.context.history):
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"a history item exceeds {MAX_HISTORY_ITEM_CHARS} characters"})
    if any(len(item.content) > MAX_ATTACHMENT_CHARS for item in request.context.attachments):
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"an attachment exceeds {MAX_ATTACHMENT_CHARS} characters"})
    context_chars = history_chars + attachment_chars + system_prompt_chars
    if context_chars > MAX_CONTEXT_CHARS:
        return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": f"context exceeds {MAX_CONTEXT_CHARS} characters"})
    context = request.context.model_dump()
    context["history"] = [item.model_dump() for item in request.context.history]
    context["attachments"] = [item.model_dump() for item in request.context.attachments]
    context_json = json.dumps(_masked_context(context), ensure_ascii=False)

    result, layer = evaluate_request(request.user_prompt, context)
    latency_ms = round((time.perf_counter() - started) * 1000, 3)
    check_id = str(uuid.uuid4())
    response = CheckResponse(
        decision=result.decision,
        risk_level=result.risk_level,
        risk_category=result.risk_category,
        explanation=_format_explanation(result.explanation),
        latency_ms=latency_ms,
        pipeline_layer=layer,
        check_id=check_id,
    )
    log_payload = {
        "check_id": check_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_prompt": _mask(request.user_prompt),
        "context_json": context_json,
        "decision": response.decision,
        "risk_level": response.risk_level,
        "risk_category": response.risk_category,
        "explanation": response.explanation,
        "latency_ms": response.latency_ms,
        "pipeline_layer": response.pipeline_layer,
        "policy_version": get_version(),
        "session_id": request.session_id,
        "user_role": request.context.user_role,
        "user_id": request.context.user_id,
        "user_name": request.context.user_name,
    }
    body = response.model_dump()
    if BACKEND_URL:
        logged = await _send_backend_log(log_payload)
        if isinstance(logged, dict) and "is_multi_step_attack" in logged:
            body["is_multi_step_attack"] = bool(logged["is_multi_step_attack"])
    return body
