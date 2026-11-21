import re
from pathlib import Path
from typing import Any

import joblib

from app.config import MODEL_PATH

_classifier_bundle: dict[str, Any] | None = None


def extract_features_text(user_prompt: str, context: dict[str, Any] | None = None,
                          normalized_text: str | None = None) -> str:
    context = context or {}
    prompt = normalized_text if normalized_text is not None else user_prompt
    role = str(context.get("user_role", "unknown")).lower()
    history = context.get("history") or []
    attachments = context.get("attachments") or []
    history_text = " ".join(str(x.get("content", "")) for x in history if isinstance(x, dict))
    attachment_text = " ".join(str(x.get("content", "")) for x in attachments if isinstance(x, dict))
    has_url = int(bool(re.search(r'https?://|www\\.', user_prompt, re.I)))
    has_base64 = int(bool(re.search(
        r'(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{8,}={0,2}(?![A-Za-z0-9+/])',
        user_prompt,
    )))
    has_prod = int(bool(re.search(r'production|\\bprod\\b|прод', user_prompt, re.I)))
    cyrillic = int(sum('а' <= ch.lower() <= 'я' for ch in prompt) > max(1, len(prompt) * 0.3))
    flags = [
        f"ROLE_{role}",
        f"HAS_ATTACHMENT_{int(bool(attachments))}",
        f"HISTORY_LEN_{min(len(history), 10)}",
        f"HAS_URL_{has_url}",
        f"HAS_BASE64_{has_base64}",
        f"HAS_CODE_{int('```' in user_prompt)}",
        f"HAS_PROD_{has_prod}",
        f"CYRILLIC_{cyrillic}",
    ]
    return " ".join(flags) + "\nCURRENT\n" + prompt + "\nHISTORY\n" + history_text + "\nATTACHMENTS\n" + attachment_text


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


def predict(user_prompt: str, context: dict[str, Any], normalized_text: str | None = None) -> dict[str, Any] | None:
    global _classifier_bundle
    if _classifier_bundle is None:
        load_classifier()
    if _classifier_bundle is None:
        return None
    text = extract_features_text(user_prompt, context, normalized_text)
    decision_model = _classifier_bundle["decisions"]
    decision_probs = decision_model.predict_proba([text])[0]
    decision_index = int(decision_probs.argmax())
    decision = str(decision_model.classes_[decision_index])
    decision_confidence = float(decision_probs[decision_index])

    category = "none"
    category_confidence = 0.0
    category_model = _classifier_bundle.get("categories")
    category_probs = []
    if category_model is not None:
        category_probs = category_model.predict_proba([text])[0]
        idx = int(category_probs.argmax())
        category = str(category_model.classes_[idx])
        category_confidence = float(category_probs[idx])

    risk_level = "none"
    risk_confidence = 0.0
    risk_model = _classifier_bundle.get("risk_levels")
    risk_probs = []
    if risk_model is not None:
        risk_probs = risk_model.predict_proba([text])[0]
        idx = int(risk_probs.argmax())
        risk_level = str(risk_model.classes_[idx])
        risk_confidence = float(risk_probs[idx])

    return {
        "decision": decision,
        "decision_confidence": decision_confidence,
        "decision_probabilities": {str(label): float(prob) for label, prob in zip(decision_model.classes_, decision_probs)},
        "risk_category": category,
        "category_confidence": category_confidence,
        "category_probabilities": {str(label): float(prob) for label, prob in zip(category_model.classes_, category_probs)} if category_model is not None else {},
        "risk_level": risk_level,
        "risk_confidence": risk_confidence,
        "risk_level_probabilities": {str(label): float(prob) for label, prob in zip(risk_model.classes_, risk_probs)} if risk_model is not None else {},
    }
