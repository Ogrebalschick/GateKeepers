import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:8000/v1/check")
    parser.add_argument("--data", default="tests/data/adversarial_regression_v23.jsonl")
    parser.add_argument("--report", default="reports/adversarial_suite_v23.json")
    parser.add_argument("--predictions", default="reports/adversarial_suite_v23_predictions.jsonl")
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    rows = [json.loads(line) for line in Path(args.data).read_text(encoding="utf-8").splitlines() if line.strip()]
    predictions = []
    confusion = {label: Counter() for label in ("allow", "confirm", "block")}
    failures = []

    with httpx.Client(timeout=args.timeout) as client:
        for row in rows:
            payload = {"user_prompt": row["user_prompt"], "context": row.get("context", {})}
            try:
                response = client.post(args.endpoint, json=payload)
                response.raise_for_status()
                result = response.json()
                actual = result.get("decision", "invalid")
                expected = row["expected_decision"]
                if expected in confusion:
                    confusion[expected][actual] += 1
                item = {
                    "id": row["id"],
                    "expected_decision": expected,
                    "predicted_decision": actual,
                    "risk_category": result.get("risk_category"),
                    "risk_level": result.get("risk_level"),
                    "pipeline_layer": result.get("pipeline_layer"),
                    "latency_ms": result.get("latency_ms"),
                    "passed": actual == expected,
                }
            except Exception as exc:
                item = {
                    "id": row["id"],
                    "expected_decision": row["expected_decision"],
                    "predicted_decision": "error",
                    "error": type(exc).__name__,
                    "passed": False,
                }
            predictions.append(item)
            if not item["passed"]:
                failures.append(item)

    passed = len(predictions) - len(failures)
    latencies = [item["latency_ms"] for item in predictions if isinstance(item.get("latency_ms"), (int, float))]
    report = {
        "suite": "astra_guard_adversarial_regression_v23",
        "examples": len(rows),
        "passed": passed,
        "failed": len(failures),
        "decision_accuracy": passed / len(rows) if rows else 0.0,
        "false_allow": sum(x["expected_decision"] == "block" and x["predicted_decision"] == "allow" for x in predictions),
        "false_block": sum(x["expected_decision"] == "allow" and x["predicted_decision"] == "block" for x in predictions),
        "confusion_matrix": {label: dict(counts) for label, counts in confusion.items()},
        "latency_mean_ms": sum(latencies) / len(latencies) if latencies else None,
        "failures": failures,
    }
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    predictions_path = Path(args.predictions)
    predictions_path.parent.mkdir(parents=True, exist_ok=True)
    predictions_path.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in predictions) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Report saved: {report_path}")
    print(f"Predictions saved: {predictions_path}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
