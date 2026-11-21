import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline, FeatureUnion

from app.pipeline.layer1_classifier import extract_features_text


def load_rows(path: Path):
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    texts = [extract_features_text(row["user_prompt"], row.get("context", {})) for row in rows]
    return rows, texts


def make_groups(rows, threshold=0.85):
    prompts = [str(row["user_prompt"]).lower() for row in rows]
    matrix = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1).fit_transform(prompts)
    similarities = cosine_similarity(matrix)
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

    for left in range(len(rows)):
        for right in range(left + 1, len(rows)):
            if similarities[left, right] >= threshold:
                union(left, right)
    return [find(index) for index in range(len(rows))]


def make_pipeline(class_weight="balanced", c_value=3.0):
    features = FeatureUnion([
        ("word", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), max_features=18000, min_df=1, sublinear_tf=True, strip_accents=None)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), max_features=30000, min_df=1, sublinear_tf=True)),
    ])
    return Pipeline([
        ("features", features),
        ("classifier", LogisticRegression(C=c_value, max_iter=1800, class_weight=class_weight, solver="lbfgs")),
    ])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="astra_public_v2/dev.jsonl")
    parser.add_argument("--output", default="models/guard_model.joblib")
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--decision-class-weight", choices=["none", "balanced", "confirm_2"], default="none")
    args = parser.parse_args()

    decision_weights = {
        "none": None,
        "balanced": "balanced",
        "confirm_2": {"allow": 1.0, "block": 1.0, "confirm": 2.0},
    }
    decision_class_weight = decision_weights[args.decision_class_weight]
    rows, texts = load_rows(Path(args.data))
    targets = {
        "decisions": [row["expected_decision"] for row in rows],
        "categories": [row["risk_category"] for row in rows],
        "risk_levels": [row["risk_level"] for row in rows],
    }
    groups = make_groups(rows)
    n_splits = max(2, round(1 / args.test_size))
    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=args.seed)
    train_idx, test_idx = next(splitter.split(texts, targets["decisions"], groups))
    report = {}
    for name, y in targets.items():
        model_weight = decision_class_weight if name == "decisions" else "balanced"
        model = make_pipeline(class_weight=model_weight)
        model.fit([texts[i] for i in train_idx], [y[i] for i in train_idx])
        pred = model.predict([texts[i] for i in test_idx])
        report[name] = {
            "macro_f1": round(float(f1_score([y[i] for i in test_idx], pred, average="macro", zero_division=0)), 4),
            "labels": list(model.classes_),
            "confusion_matrix": confusion_matrix([y[i] for i in test_idx], pred, labels=model.classes_).tolist(),
        }
        print(f"\n{name}: macro_f1={report[name]['macro_f1']}")
        print(classification_report([y[i] for i in test_idx], pred, zero_division=0))

    bundle = {}
    for name, y in targets.items():
        model_weight = decision_class_weight if name == "decisions" else "balanced"
        model = make_pipeline(class_weight=model_weight)
        model.fit(texts, y)
        bundle[name] = model
    bundle["metadata"] = {
        "training_rows": len(rows),
        "seed": args.seed,
        "group_similarity_threshold": 0.85,
        "group_count": len(set(groups)),
        "validation_size": len(test_idx),
        "validation": report,
        "decision_distribution": dict(Counter(targets["decisions"])),
        "decision_class_weight": args.decision_class_weight,
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
