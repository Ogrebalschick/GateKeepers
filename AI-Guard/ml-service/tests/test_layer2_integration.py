from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import engine


def _prepared_context():
    return {
        "safe_analysis": False,
        "analysis_context": {"user_role": "admin", "history": [], "attachments": []},
        "prompt_for_analysis": "uncertain operational request",
        "full_analysis_text": "uncertain operational request",
    }


def _prediction(confidence):
    return {
        "decision": "allow",
        "decision_confidence": confidence,
        "decision_probabilities": {"allow": confidence, "confirm": 0.0, "block": 1.0 - confidence},
        "risk_category": "none",
        "category_confidence": 0.0,
        "risk_level": "none",
        "risk_confidence": 1.0,
    }


def test_uncertain_layer1_result_is_escalated_to_layer2(monkeypatch):
    monkeypatch.setattr(engine, "prepare_analysis_context", lambda *a: _prepared_context())
    monkeypatch.setattr(engine, "check_always_block", lambda **kwargs: None)
    monkeypatch.setattr(engine, "check_rbac", lambda *args: None)
    monkeypatch.setattr(engine, "predict", lambda *args: _prediction(0.70))
    monkeypatch.setattr(engine, "LLM_ENABLED", True)
    monkeypatch.setattr(engine, "LLM_MIN_CONFIDENCE", 0.85)
    monkeypatch.setattr(engine, "is_llm_available", lambda: True)
    monkeypatch.setattr(
        engine,
        "classify_with_llm",
        lambda *args: ("block", "high", "jailbreak", "The request attempts to bypass safety controls."),
    )

    result, layer = engine.evaluate_request("uncertain operational request", {"user_role": "admin"})

    assert result.decision == "block"
    assert result.risk_level == "high"
    assert result.risk_category == "jailbreak"
    assert layer == "layer2"


def test_confident_layer1_result_does_not_call_layer2(monkeypatch):
    monkeypatch.setattr(engine, "prepare_analysis_context", lambda *a: _prepared_context())
    monkeypatch.setattr(engine, "check_always_block", lambda **kwargs: None)
    monkeypatch.setattr(engine, "check_rbac", lambda *args: None)
    monkeypatch.setattr(engine, "predict", lambda *args: _prediction(0.95))
    monkeypatch.setattr(engine, "LLM_ENABLED", True)
    monkeypatch.setattr(engine, "LLM_MIN_CONFIDENCE", 0.85)
    monkeypatch.setattr(engine, "is_llm_available", lambda: (_ for _ in ()).throw(AssertionError("must not probe LLM")))

    result, layer = engine.evaluate_request("uncertain operational request", {"user_role": "admin"})

    assert result.decision == "allow"
    assert layer == "layer1"


def test_uncertain_layer1_fails_closed_when_llm_unavailable(monkeypatch):
    monkeypatch.setattr(engine, "prepare_analysis_context", lambda *a: _prepared_context())
    monkeypatch.setattr(engine, "check_always_block", lambda **kwargs: None)
    monkeypatch.setattr(engine, "check_rbac", lambda *args: None)
    monkeypatch.setattr(engine, "predict", lambda *args: _prediction(0.70))
    monkeypatch.setattr(engine, "LLM_ENABLED", True)
    monkeypatch.setattr(engine, "LLM_MIN_CONFIDENCE", 0.85)
    monkeypatch.setattr(engine, "is_llm_available", lambda: False)

    result, layer = engine.evaluate_request("uncertain operational request", {"user_role": "admin"})

    assert result.decision == "confirm"
    assert result.risk_level == "medium"
    assert layer == "layer1"


def test_service_responds_while_layer2_is_generating(monkeypatch):
    started, release = Event(), Event()

    def classify(*args):
        started.set()
        if not release.wait(10):
            raise RuntimeError("Timed out waiting for the test to release generation")
        return "allow", "none", "none", "The user is asking for a meeting title."

    monkeypatch.setattr(engine, "LLM_ENABLED", True)
    monkeypatch.setattr(engine, "predict", lambda *args: _prediction(0.70))
    monkeypatch.setattr(engine, "is_llm_available", lambda: True)
    monkeypatch.setattr(engine, "classify_with_llm", classify)
    payload = {"user_prompt": "A title for our meeting, please.", "context": {"user_role": "developer"}}
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as callers:
        waiting = callers.submit(client.post, "/v1/check", json=payload)
        try:
            assert started.wait(5)
            assert callers.submit(client.get, "/").result(timeout=2).status_code == 200
        finally:
            release.set()
        assert waiting.result(timeout=5).json()["pipeline_layer"] == "layer2"
