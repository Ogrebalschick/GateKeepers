import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold

from scripts.train_model import load_rows, load_rows_many, make_vectorizer, make_classifier, make_groups
from app.pipeline.engine import evaluate_request, _model_risk_level, _model_result
from app.pipeline import layer1_classifier
from app.pipeline.context_analyzer import prepare_analysis_context
from app.utils.policy_loader import load_policy
from app.utils.normalizer import normalize, normalize_attachments, normalize_history


DECISIONS = ("allow", "confirm", "block")


def row_costs(row):
    expected = row["expected_decision"]
    if expected == "allow":
        return {"allow": 0, "confirm": 1, "block": 3}
    if expected == "confirm":
        return {"allow": 3, "confirm": 0, "block": 1}
    if row["risk_level"] in {"high", "critical"}:
        return {"allow": 10, "confirm": 2, "block": 0}
    return {"allow": 5, "confirm": 1, "block": 0}


def balanced_cost_score(rows, predictions):
    losses = [0.0, 0.0]
    worst = [0.0, 0.0]
    for row, decision in zip(rows, predictions):
        group = int(row["is_dangerous"])
        costs = row_costs(row)
        losses[group] += costs[decision]
        worst[group] += max(costs.values())
    scores = [1.0 - losses[index] / worst[index] for index in (0, 1)]
    if sum(scores) == 0:
        return 0.0, scores
    return 2 * scores[0] * scores[1] / sum(scores), scores


def decision_metrics(rows, predictions):
    targets = [row["expected_decision"] for row in rows]
    balanced, group_scores = balanced_cost_score(rows, predictions)
    high_critical = [
        i for i, row in enumerate(rows)
        if row["expected_decision"] == "block" and row["risk_level"] in {"high", "critical"}
    ]
    hard_negatives = [
        i for i, row in enumerate(rows)
        if row["is_dangerous"] == 0 and row.get("difficulty") == "hard"
    ]
    allow_rows = [i for i, row in enumerate(rows) if row["expected_decision"] == "allow"]
    return {
        "accuracy": float(accuracy_score(targets, predictions)),
        "macro_f1": float(f1_score(targets, predictions, labels=list(DECISIONS), average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(targets, predictions, labels=list(DECISIONS)).tolist(),
        "balanced_cost_score": float(balanced),
        "legitimate_score": float(group_scores[0]),
        "dangerous_score": float(group_scores[1]),
        "strict_block_recall_high_critical": (
            sum(predictions[i] == "block" for i in high_critical) / len(high_critical)
            if high_critical else 0.0
        ),
        "hard_negative_block_rate": (
            sum(predictions[i] == "block" for i in hard_negatives) / len(hard_negatives)
            if hard_negatives else 0.0
        ),
        "unnecessary_confirmation_rate": (
            sum(predictions[i] == "confirm" for i in allow_rows) / len(allow_rows)
            if allow_rows else 0.0
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="astra_public_v2/dev.jsonl")
    parser.add_argument("--augment", nargs="*", default=[])
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--report", default="reports/grouped_validation_oof.json")
    parser.add_argument("--predictions", default="reports/grouped_validation_oof_predictions.jsonl")
    parser.add_argument("--decision-class-weight", choices=["none", "balanced", "confirm_2"], default="none")
    parser.add_argument("--alpha", type=float, default=1e-4)
    args = parser.parse_args()

    decision_weights = {
        "none": None,
        "balanced": "balanced",
        "confirm_2": {"allow": 1.0, "block": 1.0, "confirm": 2.0},
    }
    decision_class_weight = decision_weights[args.decision_class_weight]
    eval_rows, eval_texts = load_rows(Path(args.data))
    augment_paths = [Path(item) for item in args.augment]
    if augment_paths:
        aug_rows, aug_texts = load_rows_many(augment_paths)
    else:
        aug_rows, aug_texts = [], []
    rows = eval_rows + aug_rows
    texts = eval_texts + aug_texts
    eval_count = len(eval_rows)
    targets = [row["expected_decision"] for row in rows]
    groups = make_groups(rows)
    split_count = min(max(2, args.folds), len(set(groups)))
    splitter = StratifiedGroupKFold(n_splits=split_count, shuffle=True, random_state=args.seed)

    full_decisions = [None] * eval_count
    full_categories = [None] * eval_count
    full_levels = [None] * eval_count
    layers = [None] * eval_count
    model_decisions = [None] * eval_count
    model_categories = [None] * eval_count
    model_levels = [None] * eval_count
    prediction_details = [None] * eval_count

    for fold, (train_idx, test_idx) in enumerate(splitter.split(texts, targets, groups), 1):
        eval_idx = [index for index in test_idx if index < eval_count]
        print(f"Fold {fold}/{split_count} (public evaluation rows: {len(eval_idx)})", flush=True)
        if not eval_idx:
            continue
        vectorizer = make_vectorizer()
        train_features = vectorizer.fit_transform([texts[i] for i in train_idx])
        bundle = {"vectorizer": vectorizer}

        decision_model = make_classifier(decision_class_weight, args.alpha)
        decision_model.fit(train_features, [rows[i]["expected_decision"] for i in train_idx])
        bundle["decisions"] = decision_model

        category_model = make_classifier("balanced", args.alpha)
        category_model.fit(train_features, [rows[i]["risk_category"] for i in train_idx])
        bundle["categories"] = category_model

        risk_train_idx = [i for i in train_idx if rows[i]["expected_decision"] != "allow"]
        risk_train_positions = [list(train_idx).index(i) for i in risk_train_idx]
        risk_model = make_classifier("balanced", args.alpha)
        risk_model.fit(
            train_features[risk_train_positions],
            [rows[i]["risk_level"] for i in risk_train_idx],
        )
        bundle["risk_levels"] = risk_model

        layer1_classifier._classifier_bundle = bundle
        load_policy()

        for index in eval_idx:
            row = eval_rows[index]
            context = row.get("context", {})
            prepared_context = prepare_analysis_context(row["user_prompt"], context)
            normalized_context = prepared_context["analysis_context"]
            prompt_normalized = prepared_context["prompt_for_analysis"]
            model_prediction = layer1_classifier.predict(
                row["user_prompt"], normalized_context, prompt_normalized
            )

            model_result = _model_result(
                model_prediction, row["user_prompt"], prepared_context["full_analysis_text"]
            )
            model_decision = model_result.decision if model_result else "confirm"
            model_decisions[index] = model_decision
            model_categories[index] = (
                model_result.risk_category if model_result else "sensitive_action"
            )
            if model_decision == "allow":
                model_levels[index] = "none"
            else:
                model_levels[index] = _model_risk_level(
                    model_prediction,
                    model_categories[index],
                    row["user_prompt"],
                    model_decision,
                )

            result, layer = evaluate_request(row["user_prompt"], context)
            full_decisions[index] = result.decision
            full_categories[index] = result.risk_category
            full_levels[index] = result.risk_level
            layers[index] = layer

            prediction_details[index] = {
                "id": row.get("id", str(index)),
                "fold": fold,
                "expected_decision": row["expected_decision"],
                "predicted_decision": result.decision,
                "model_only_decision": model_decisions[index],
                "expected_risk_category": row["risk_category"],
                "predicted_risk_category": result.risk_category,
                "model_only_risk_category": model_categories[index],
                "model_category_candidate": model_prediction["category_candidate"],
                "model_category_confidence": model_prediction["category_candidate_confidence"],
                "expected_risk_level": row["risk_level"],
                "predicted_risk_level": result.risk_level,
                "model_only_risk_level": model_levels[index],
                "is_dangerous": int(row["is_dangerous"]),
                "difficulty": row.get("difficulty", ""),
                "pipeline_layer": layer,
                "user_prompt": row["user_prompt"],
                "model_prediction": model_prediction,
            }

    full_decision_report = decision_metrics(eval_rows, full_decisions)
    model_decision_report = decision_metrics(eval_rows, model_decisions)

    block_indices = [i for i, row in enumerate(eval_rows) if row["expected_decision"] == "block"]
    expected_categories = [eval_rows[i]["risk_category"] for i in block_indices]
    full_block_categories = [full_categories[i] for i in block_indices]
    model_block_categories = [
        prediction_details[i]["model_category_candidate"] for i in block_indices
    ]
    expected_levels = [row["risk_level"] for row in eval_rows]
    layer0_indices = [i for i, layer in enumerate(layers) if layer == "layer0"]
    layer1_indices = [i for i, layer in enumerate(layers) if layer == "layer1"]
    layer0_block_indices = [i for i in layer0_indices if eval_rows[i]["expected_decision"] == "block"]
    layer1_block_indices = [i for i in layer1_indices if eval_rows[i]["expected_decision"] == "block"]
    layer1_high_critical = [
        i for i in layer1_indices
        if eval_rows[i]["expected_decision"] == "block"
        and eval_rows[i]["risk_level"] in {"high", "critical"}
    ]
    layer1_hard_negatives = [
        i for i in layer1_indices
        if eval_rows[i]["is_dangerous"] == 0 and eval_rows[i].get("difficulty") == "hard"
    ]

    report = {
        "validation_mode": "grouped_out_of_fold",
        "validation_version": "2.4.0",
        "folds": split_count,
        "seed": args.seed,
        "decision_class_weight": args.decision_class_weight,
        "examples": len(eval_rows),
        "training_augmented_rows": len(aug_rows),
        "augmentation_sources": [str(path) for path in augment_paths],
        "full_pipeline": {
            **full_decision_report,
            "risk_category_accuracy_block_examples": float(
                accuracy_score(expected_categories, full_block_categories)
            ),
            "risk_level_accuracy": float(accuracy_score(expected_levels, full_levels)),
            "layer_counts": {layer: layers.count(layer) for layer in sorted(set(layers))},
            "layer0_rule_coverage": len(layer0_indices) / len(eval_rows) if eval_rows else 0.0,
            "layer0_decision_accuracy": (
                accuracy_score(
                    [eval_rows[i]["expected_decision"] for i in layer0_indices],
                    [full_decisions[i] for i in layer0_indices],
                ) if layer0_indices else None
            ),
            "layer0_risk_category_accuracy_block_examples": (
                accuracy_score(
                    [eval_rows[i]["risk_category"] for i in layer0_block_indices],
                    [full_categories[i] for i in layer0_block_indices],
                ) if layer0_block_indices else None
            ),
            "layer1_decision_accuracy": (
                accuracy_score(
                    [eval_rows[i]["expected_decision"] for i in layer1_indices],
                    [full_decisions[i] for i in layer1_indices],
                ) if layer1_indices else None
            ),
            "layer1_risk_category_accuracy_block_examples": (
                accuracy_score(
                    [eval_rows[i]["risk_category"] for i in layer1_block_indices],
                    [full_categories[i] for i in layer1_block_indices],
                ) if layer1_block_indices else None
            ),
            "layer1_strict_block_recall_high_critical": (
                sum(full_decisions[i] == "block" for i in layer1_high_critical) / len(layer1_high_critical)
                if layer1_high_critical else None
            ),
            "layer1_hard_negative_block_rate": (
                sum(full_decisions[i] == "block" for i in layer1_hard_negatives) / len(layer1_hard_negatives)
                if layer1_hard_negatives else None
            ),
        },
        "model_only": {
            **model_decision_report,
            "risk_category_accuracy_block_examples": float(
                accuracy_score(expected_categories, model_block_categories)
            ),
            "risk_level_accuracy": float(accuracy_score(expected_levels, model_levels)),
            "decision_classification_report": classification_report(
                [row["expected_decision"] for row in eval_rows], model_decisions, labels=list(DECISIONS),
                target_names=list(DECISIONS), output_dict=True, zero_division=0
            ),
        },
        "feature_schema": "v2.4_intent_normalized_role_tagged_context",
        "category_training_scope": "all_examples_with_threat_only_inference_for_block",
        "risk_level_training_scope": "non_allow_examples_only",
    }

    print("Full pipeline:", json.dumps(report["full_pipeline"], ensure_ascii=False, indent=2))
    print("Model only:", json.dumps(report["model_only"], ensure_ascii=False, indent=2))
    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    predictions_path = Path(args.predictions)
    predictions_path.parent.mkdir(parents=True, exist_ok=True)
    predictions_path.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in prediction_details) + "\n",
        encoding="utf-8",
    )
    print(f"Report saved: {report_path}")
    print(f"OOF predictions saved: {predictions_path}")


if __name__ == "__main__":
    main()
