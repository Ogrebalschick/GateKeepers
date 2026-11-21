import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import FeatureUnion

from app.pipeline.layer1_classifier import extract_features_text
from app.pipeline.context_analyzer import prepare_analysis_context
from app.utils.normalizer import normalize


def load_rows(path: Path):
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    texts = []
    for row in rows:
        prepared = prepare_analysis_context(row["user_prompt"], row.get("context", {}))
        texts.append(extract_features_text(
            row["user_prompt"], prepared["analysis_context"], prepared["prompt_for_analysis"]
        ))
    return rows, texts


def load_rows_many(paths):
    all_rows, all_texts = [], []
    for path in paths:
        rows, texts = load_rows(Path(path))
        all_rows.extend(rows)
        all_texts.extend(texts)
    return all_rows, all_texts


def make_groups(rows, threshold=0.85):
    parent = list(range(len(rows)))

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    fields = {"user_prompt": [], "history": [], "attachments": [], "attachment_content": [], "combined_context": []}
    for row in rows:
        context = row.get("context") or {}
        prompt = normalize(str(row.get("user_prompt", "")))
        history = "\n".join(
            normalize(str(item.get("content", "")))
            for item in context.get("history") or []
            if isinstance(item, dict)
        )
        attachment_items = [item for item in context.get("attachments") or [] if isinstance(item, dict)]
        attachments = "\n".join(
            " ".join([
                str(item.get("type", "")),
                str(item.get("name", "")),
                normalize(str(item.get("content", ""))),
            ])
            for item in attachment_items
        )
        attachment_content = "\n".join(normalize(str(item.get("content", ""))) for item in attachment_items)
        fields["user_prompt"].append(prompt)
        fields["history"].append(history)
        fields["attachments"].append(attachments)
        fields["attachment_content"].append(attachment_content)
        fields["combined_context"].append("\n".join([prompt, history, attachments]))

    for values in fields.values():
        indices = [index for index, value in enumerate(values) if len(value.strip()) >= 3]
        if len(indices) < 2:
            continue
        selected = [values[index].lower() for index in indices]
        try:
            matrix = TfidfVectorizer(
                analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True
            ).fit_transform(selected)
        except ValueError:
            continue
        similarities = cosine_similarity(matrix)
        for left_pos in range(len(indices)):
            for right_pos in range(left_pos + 1, len(indices)):
                if similarities[left_pos, right_pos] >= threshold:
                    union(indices[left_pos], indices[right_pos])

    return [find(index) for index in range(len(rows))]


def make_vectorizer():
    return FeatureUnion([
        ("word", TfidfVectorizer(
            analyzer="word", ngram_range=(1, 2), max_features=18000,
            min_df=1, sublinear_tf=True, strip_accents=None
        )),
        ("char", TfidfVectorizer(
            analyzer="char_wb", ngram_range=(2, 5), max_features=30000,
            min_df=1, sublinear_tf=True
        )),
    ])


def make_classifier(class_weight="balanced", alpha=1e-4):
    return SGDClassifier(
        loss="log_loss",
        alpha=alpha,
        max_iter=1000,
        tol=1e-3,
        class_weight=class_weight,
        random_state=42,
    )


def fit_bundle(rows, texts, decision_class_weight=None, alpha=1e-4):
    vectorizer = make_vectorizer()
    features = vectorizer.fit_transform(texts)
    decisions = [row["expected_decision"] for row in rows]
    categories = [row["risk_category"] for row in rows]
    risk_levels = [row["risk_level"] for row in rows]

    decision_model = make_classifier(decision_class_weight, alpha)
    decision_model.fit(features, decisions)

    category_model = make_classifier("balanced", alpha)
    category_model.fit(features, categories)

    risk_indices = [index for index, row in enumerate(rows) if row["expected_decision"] != "allow"]
    risk_model = make_classifier("balanced", alpha)
    risk_model.fit(features[risk_indices], [rows[index]["risk_level"] for index in risk_indices])

    return {
        "vectorizer": vectorizer,
        "decisions": decision_model,
        "categories": category_model,
        "risk_levels": risk_model,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="astra_public_v2/dev.jsonl")
    parser.add_argument("--augment", nargs="*", default=[])
    parser.add_argument("--output", default="models/guard_model.joblib")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--decision-class-weight", choices=["none", "balanced", "confirm_2"], default="none")
    parser.add_argument("--alpha", type=float, default=1e-4)
    args = parser.parse_args()

    decision_weights = {
        "none": None,
        "balanced": "balanced",
        "confirm_2": {"allow": 1.0, "block": 1.0, "confirm": 2.0},
    }
    decision_class_weight = decision_weights[args.decision_class_weight]
    source_paths = [Path(args.data), *[Path(item) for item in args.augment]]
    rows, texts = load_rows_many(source_paths)
    groups = make_groups(rows)
    targets = [row["expected_decision"] for row in rows]
    n_splits = max(2, round(1 / args.test_size))
    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=args.seed)
    train_idx, test_idx = next(splitter.split(texts, targets, groups))

    report = {}
    vectorizer = make_vectorizer()
    train_features = vectorizer.fit_transform([texts[i] for i in train_idx])
    test_features = vectorizer.transform([texts[i] for i in test_idx])

    for name, field in (("decisions", "expected_decision"), ("risk_levels", "risk_level")):
        if name == "risk_levels":
            train_rows = [i for i in train_idx if rows[i]["expected_decision"] != "allow"]
            test_rows = [i for i in test_idx if rows[i]["expected_decision"] != "allow"]
            train_positions = [list(train_idx).index(i) for i in train_rows]
            test_positions = [list(test_idx).index(i) for i in test_rows]
            x_train = train_features[train_positions]
            x_test = test_features[test_positions]
        else:
            train_rows, test_rows = list(train_idx), list(test_idx)
            x_train, x_test = train_features, test_features
        model = make_classifier(
            decision_class_weight if name == "decisions" else "balanced",
            args.alpha,
        )
        model.fit(x_train, [rows[i][field] for i in train_rows])
        y_true = [rows[i][field] for i in test_rows]
        y_pred = model.predict(x_test)
        report[name] = {
            "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
            "evaluation_rows": len(test_rows),
            "labels": list(model.classes_),
            "confusion_matrix": confusion_matrix(y_true, y_pred, labels=model.classes_).tolist(),
        }
        print(f"\n{name}: macro_f1={report[name]['macro_f1']}")
        print(classification_report(y_true, y_pred, zero_division=0))

    category_model = make_classifier("balanced", args.alpha)
    category_model.fit(train_features, [rows[i]["risk_category"] for i in train_idx])
    y_true = [rows[i]["risk_category"] for i in test_idx]
    y_pred = category_model.predict(test_features)
    report["categories"] = {
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        "accuracy": round(sum(a == b for a, b in zip(y_true, y_pred)) / len(y_true), 4) if y_true else 0.0,
        "labels": list(category_model.classes_),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=category_model.classes_).tolist(),
    }
    print(f"\\ncategories: macro_f1={report['categories']['macro_f1']}")
    print(classification_report(y_true, y_pred, zero_division=0))


    bundle = fit_bundle(rows, texts, decision_class_weight, args.alpha)
    bundle["metadata"] = {
        "model_version": "2.4.0",
        "classifier": "SGDClassifier(loss=log_loss)",
        "vectorizer": "FeatureUnion(TfidfVectorizer word 1-2, char_wb 2-5)",
        "training_rows": len(rows),
        "public_training_rows": sum(1 for row in rows if str(row.get("source", "")).startswith("public") or row.get("id", "").startswith("dev-")),
        "augmented_training_rows": len(rows) - sum(1 for row in rows if str(row.get("source", "")).startswith("public") or row.get("id", "").startswith("dev-")),
        "training_sources": [str(path) for path in source_paths],
        "seed": args.seed,
        "group_similarity_threshold": 0.85,
        "group_count": len(set(groups)),
        "validation_size": len(test_idx),
        "validation": report,
        "decision_distribution": dict(Counter(targets)),
        "decision_class_weight": args.decision_class_weight,
        "category_training_rows": len(rows),
        "category_classes": sorted(set(row["risk_category"] for row in rows)),
        "risk_level_training_rows": sum(row["expected_decision"] != "allow" for row in rows),
        "risk_level_training_scope": "non_allow_examples_only",
        "feature_schema": "v2.4_intent_normalized_role_tagged_context",
        "grouping_fields": ["user_prompt", "context.history.content", "context.attachments.content"],
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, output, compress=3)
    metadata_path = output.parent / "training_metadata.json"
    metadata_path.write_text(json.dumps(bundle["metadata"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nSaved {output} ({output.stat().st_size:,} bytes)")
    print(f"Saved {metadata_path}")


if __name__ == "__main__":
    main()
