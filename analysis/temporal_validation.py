"""Check four model families on older-to-later, animal-disjoint training folds.

Usage: python analysis/temporal_validation.py --records-dir ../step3_results
This is a training-only robustness audit. It never reads the final test split and
does not replace the selected model or claim a new independent test result.
"""
import argparse
import csv
import json
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.svm import LinearSVC


REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "artifacts"))
from shelter_preprocessing import RAW_INPUT_FIELDS, make_preprocessor  # noqa: E402


# Each fold leaves at least 31 days between old training intakes and validation.
FOLDS = (
    ("2024-07-01", "2024-11-01"),
    ("2024-11-01", "2025-03-01"),
    ("2025-03-01", "2025-05-31"),
)


def load_records(path):
    frame = pd.read_csv(path, dtype={"id": "string", "source_row_number": "Int64"})
    needed = set(RAW_INPUT_FIELDS) | {"id", "label_known_date", "long_stay_30"}
    missing = needed - set(frame.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    frame["intake_date_dt"] = pd.to_datetime(frame["intake_date"], errors="raise")
    frame["label_known_dt"] = pd.to_datetime(frame["label_known_date"], errors="raise")
    return frame.sort_values("intake_date_dt", kind="stable").reset_index(drop=True)


def encoded_frames(train, validation):
    prep = make_preprocessor(rare_min_count=10)
    fitted = prep.fit_transform(train[RAW_INPUT_FIELDS])
    later = prep.transform(validation[RAW_INPUT_FIELDS])
    names = list(prep.get_feature_names_out())
    older = pd.DataFrame(fitted, columns=names)
    newer = pd.DataFrame(later, columns=names)
    keep = [column for column in names if older[column].nunique(dropna=False) > 1]
    older, newer = older[keep].copy(), newer[keep].copy()
    return older, newer, int(prep.named_steps["features"].fit_rows_)


def age_interactions(frame):
    expanded = frame.copy()
    for column in list(frame.columns):
        if column.startswith(("categories__type_", "categories__intake_condition_")):
            expanded["age_x_" + column] = frame["age__age_years"] * frame[column]
    return expanded


def models():
    return {
        "Logistic regression": LogisticRegression(C=1, solver="liblinear", max_iter=3000, random_state=42),
        "Linear SVM": LinearSVC(C=1, max_iter=10000, random_state=42),
        "Random forest": RandomForestClassifier(n_estimators=250, min_samples_leaf=3,
                                                   class_weight="balanced_subsample", n_jobs=-1, random_state=42),
        "Gradient boosting": HistGradientBoostingClassifier(max_iter=180, max_leaf_nodes=15,
                                                               l2_regularization=1, random_state=42),
        "Selected tuned forest + age interactions": RandomForestClassifier(
            n_estimators=400, min_samples_leaf=1, max_features=0.5, max_depth=None,
            class_weight=None, n_jobs=-1, random_state=42),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("analysis/temporal_validation_results.csv"))
    args = parser.parse_args()
    all_training = load_records(args.records_dir / "train_records.csv")
    rows = []
    for fold, (start_text, end_text) in enumerate(FOLDS, start=1):
        start, end = pd.Timestamp(start_text), pd.Timestamp(end_text)
        later = all_training.loc[(all_training.intake_date_dt >= start)
                                 & (all_training.intake_date_dt < end)].copy()
        old_cutoff = start - timedelta(days=31)
        older = all_training.loc[(all_training.intake_date_dt < old_cutoff)
                                 & (all_training.label_known_dt < start)].copy()
        older = older.loc[~older.id.isin(set(later.id))].copy()
        if min(len(older), len(later)) < 100 or older.long_stay_30.nunique() < 2 or later.long_stay_30.nunique() < 2:
            raise ValueError(f"Fold {fold} is too small or has only one class")
        overlap = len(set(older.id) & set(later.id))
        assert overlap == 0 and older.intake_date_dt.max() < later.intake_date_dt.min()
        x_old, x_later, fit_rows = encoded_frames(older, later)
        assert fit_rows == len(older)
        y_old, y_later = older.long_stay_30.astype(int), later.long_stay_30.astype(int)
        for name, model in models().items():
            use_interactions = name.startswith("Selected tuned")
            a, b = (age_interactions(x_old), age_interactions(x_later)) if use_interactions else (x_old, x_later)
            model.fit(a, y_old)
            score = model.predict_proba(b)[:, 1] if hasattr(model, "predict_proba") else model.decision_function(b)
            rows.append({
                "fold": fold, "validation_start": start_text, "validation_end_exclusive": end_text,
                "training_rows": len(older), "validation_rows": len(later),
                "training_animal_overlap": overlap, "fitted_preprocessing_rows": fit_rows,
                "validation_long_stay_rate": round(float(y_later.mean()), 5),
                "model": name, "average_precision": round(float(average_precision_score(y_later, score)), 5),
            })
        print(f"Fold {fold}: {len(older)} older records, {len(later)} later records, {overlap} shared animal IDs")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    means = {}
    for name in models():
        values = [r["average_precision"] for r in rows if r["model"] == name]
        means[name] = round(float(np.mean(values)), 5)
    notes = {
        "purpose": "Training-only temporal and animal-disjoint robustness audit",
        "uses_validation_split": False, "uses_test_split": False,
        "preprocessing_fitted_separately_per_fold": True,
        "selected_deployed_model_changed": False,
        "mean_average_precision": means,
        "limitations": [
            "The windows have different sizes and long-stay rates; means are descriptive.",
            "These folds check generalization within the old training period, not current shelter deployment.",
            "A single retrospective snapshot cannot prove when mutable intake fields were last changed.",
        ],
    }
    note_path = args.output.with_suffix(".json")
    note_path.write_text(json.dumps(notes, indent=2) + "\n", encoding="utf-8")
    print("Mean average precision:", means)
    print("Saved", args.output, "and", note_path)


if __name__ == "__main__":
    main()
