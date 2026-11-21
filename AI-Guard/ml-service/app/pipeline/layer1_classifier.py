import re
from pathlib import Path
from typing import Any

import joblib

from app.config import MODEL_PATH
from app.utils.normalizer import normalize, normalize_attachments, normalize_history

_classifier_bundle: dict[str, Any] | None = None

_THREAT_CATEGORIES = {
    "abuse", "data_exfiltration", "fraud_social_engineering", "harmful_content",
    "indirect_injection", "jailbreak", "privilege_escalation", "prompt_injection",
    "system_prompt_extraction", "system_prompt_override", "tool_abuse",
    "unauthorized_data_access",
}


def prepare_context_for_features(context: dict[str, Any] | None) -> dict[str, Any]:
    source = context or {}
    return {
        **source,
        "history": normalize_history(source.get("history") or []),
        "attachments": normalize_attachments(source.get("attachments") or []),
    }


def extract_features_text(
    user_prompt: str,
    context: dict[str, Any] | None = None,
    normalized_text: str | None = None,
) -> str:
    context = context or {}
    prompt = normalized_text if normalized_text is not None else normalize(user_prompt)
    role = str(context.get("user_role", "unknown")).lower()
    history = context.get("history") or []
    attachments = context.get("attachments") or []
    history_text = " ".join(
        f"HISTORY_{str(item.get('role', 'user')).upper()} {item.get('content', '')}"
        for item in history if isinstance(item, dict)
    )
    attachment_text = " ".join(
        f"ATTACHMENT_TYPE_{item.get('type', 'document')} ATTACHMENT_NAME_{item.get('name', '')} {item.get('content', '')}"
        for item in attachments if isinstance(item, dict)
    )
    has_base64 = bool(re.search(r'(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{8,}={0,2}(?![A-Za-z0-9+/])', user_prompt))
    url_pattern = r'https?://|www\.'
    has_url = bool(re.search(url_pattern, user_prompt, re.I))
    flags = [
        f"ROLE_{role}",
        f"HAS_ATTACHMENT_{int(bool(attachments))}",
        f"HISTORY_LEN_{min(len(history), 10)}",
        f"HAS_URL_{int(has_url)}",
        f"HAS_CODE_{int('```' in user_prompt)}",
        f"HAS_PROD_{int(bool(re.search(r'production|prod|прод', user_prompt, re.I)))}",
        f"CYRILLIC_{int(sum('а' <= ch.lower() <= 'я' for ch in prompt) > max(1, len(prompt) * 0.3))}",
        f"HAS_BASE64_{int(has_base64)}",
    ]
    return (
        " ".join(flags)
        + "\nCURRENT\n" + prompt
        + "\nHISTORY\n" + history_text
        + "\nATTACHMENTS\n" + attachment_text
    )



def load_classifier(path: str | Path | None = None) -> dict[str, Any] | None:
    global _classifier_bundle
    target = Path(path) if path else MODEL_PATH
    if not target.exists():
        _classifier_bundle = None
        return None
    try:
        bundle = joblib.load(target)
        if not isinstance(bundle, dict) or "decisions" not in bundle:
            _classifier_bundle = None
            return None
        _classifier_bundle = bundle
        return bundle
    except Exception:
        _classifier_bundle = None
        return None


def is_classifier_loaded() -> bool:
    return _classifier_bundle is not None


def predict(
    user_prompt: str,
    context: dict[str, Any],
    normalized_text: str | None = None,
) -> dict[str, Any] | None:
    global _classifier_bundle
    if _classifier_bundle is None:
        load_classifier()
    if _classifier_bundle is None:
        return None

    text = extract_features_text(user_prompt, context, normalized_text)
    if "vectorizer" in _classifier_bundle:
        model_input = _classifier_bundle["vectorizer"].transform([text])
    else:
        model_input = [text]
    decision_model = _classifier_bundle["decisions"]
    decision_probs = decision_model.predict_proba(model_input)[0]
    decision_index = int(decision_probs.argmax())
    decision = str(decision_model.classes_[decision_index])
    decision_confidence = float(decision_probs[decision_index])

    category_candidate = "tool_abuse"
    category_candidate_confidence = 0.0
    category_probs: list[float] = []
    category_model = _classifier_bundle.get("categories")
    if category_model is not None:
        category_probs = category_model.predict_proba(model_input)[0]
        threat_indices = [
            index for index, label in enumerate(category_model.classes_)
            if str(label) in _THREAT_CATEGORIES
        ]
        if threat_indices:
            category_index = max(threat_indices, key=lambda index: float(category_probs[index]))
        else:
            category_index = int(category_probs.argmax())
        category_candidate = str(category_model.classes_[category_index])
        category_candidate_confidence = float(category_probs[category_index])

    category = category_candidate if decision == "block" else (
        "sensitive_action" if decision == "confirm" else "none"
    )
    category_confidence = category_candidate_confidence if decision == "block" else 0.0

    risk_level = "none"
    risk_confidence = 0.0
    risk_probs: list[float] = []
    risk_model = _classifier_bundle.get("risk_levels")
    if risk_model is not None and decision != "allow":
        risk_probs = risk_model.predict_proba(model_input)[0]
        risk_index = int(risk_probs.argmax())
        risk_level = str(risk_model.classes_[risk_index])
        risk_confidence = float(risk_probs[risk_index])

    return {
        "decision": decision,
        "decision_confidence": decision_confidence,
        "decision_probabilities": {
            str(label): float(prob)
            for label, prob in zip(decision_model.classes_, decision_probs)
        },
        "risk_category": category,
        "category_confidence": category_confidence,
        "category_candidate": category_candidate,
        "category_candidate_confidence": category_candidate_confidence,
        "category_probabilities": {
            str(label): float(prob)
            for label, prob in zip(category_model.classes_, category_probs)
        } if category_model is not None and len(category_probs) > 0 else {},
        "risk_level": risk_level,
        "risk_confidence": risk_confidence,
        "risk_level_probabilities": {
            str(label): float(prob)
            for label, prob in zip(risk_model.classes_, risk_probs)
        } if risk_model is not None and len(risk_probs) > 0 else {},
    }
