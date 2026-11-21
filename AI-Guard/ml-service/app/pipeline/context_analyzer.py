from typing import Any

from app.pipeline.intent import (
    analysis_surface,
    is_document_review_request,
    is_safe_analysis_request,
    prepare_history,
    safe_attachment_content,
)
from app.utils.normalizer import normalize, normalize_attachments, normalize_history


def prepare_analysis_context(user_prompt: str, context: dict[str, Any] | None) -> dict[str, Any]:
    source = context or {}
    safe_analysis = is_safe_analysis_request(user_prompt)
    normalized_prompt = normalize(user_prompt)
    prompt_for_analysis = analysis_surface(normalized_prompt) if safe_analysis else normalized_prompt

    attachments = normalize_attachments(source.get("attachments") or [])
    if is_document_review_request(user_prompt):
        attachments = [
            {**item, "content": safe_attachment_content(str(item.get("content", "")), user_prompt)}
            for item in attachments
        ]

    raw_history = normalize_history(source.get("history") or [])
    history = prepare_history(raw_history, user_prompt)
    full_analysis_text = "\n".join([
        prompt_for_analysis,
        *[item["content"] for item in history if item["role"].lower() == "user"],
        *[str(item.get("content", "")) for item in attachments],
    ])
    analysis_context = {
        **source,
        "history": history,
        "attachments": attachments,
    }
    return {
        "safe_analysis": safe_analysis,
        "normalized_prompt": normalized_prompt,
        "prompt_for_analysis": prompt_for_analysis,
        "analysis_context": analysis_context,
        "raw_history": raw_history,
        "full_analysis_text": full_analysis_text,
    }
