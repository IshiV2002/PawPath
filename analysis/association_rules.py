"""Mine intake-only long-stay patterns with training and validation admissions.

Run from the repository root:
  python analysis/association_rules.py --records-dir ../step3_results

The output is aggregate counts only. It does not use test rows or animal IDs.
"""
import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path


DISPLAY_FAMILIES = (
    ("age_group", "intake_condition"),
    ("type", "intake_type"),
    ("age_group", "intake_type"),
    ("type", "age_group"),
)
MIN_TRAIN = 80
MIN_VALIDATION = 25
MIN_VALIDATION_LIFT = 1.20


def category(value):
    value = " ".join((value or "").strip().upper().split())
    return value or "UNKNOWN"


def age_group(row):
    birth_text = (row.get("date_of_birth") or "")[:10]
    try:
        birth = date.fromisoformat(birth_text)
        intake = date.fromisoformat(row["intake_date"][:10])
    except ValueError:
        return "Age unknown"
    years = (intake - birth).days / 365.25
    if years < 0:
        return "Age unknown"
    if years < 1:
        return "Under 1 year"
    if years < 7:
        return "1 to 6 years"
    return "7 years or older"


def items(row):
    return {
        "type": category(row["type"]),
        "age_group": age_group(row),
        "intake_type": category(row["intake_type"]),
        "intake_condition": category(row["intake_condition"]),
    }


def read_records(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        records = list(csv.DictReader(stream))
    if not records or any(r["long_stay_30"] not in {"0", "1"} for r in records):
        raise ValueError(f"Missing records or invalid targets: {path}")
    return records


def count_patterns(records):
    counts, positives = Counter(), Counter()
    for row in records:
        values = items(row)
        for fields in DISPLAY_FAMILIES:
            key = tuple((field, values[field]) for field in fields)
            counts[key] += 1
            positives[key] += int(row["long_stay_30"])
    return counts, positives


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("frontend/insights.json"))
    args = parser.parse_args()
    train = read_records(args.records_dir / "train_records.csv")
    validation = read_records(args.records_dir / "validation_records.csv")
    train_counts, train_pos = count_patterns(train)
    val_counts, val_pos = count_patterns(validation)
    train_base = sum(int(r["long_stay_30"]) for r in train) / len(train)
    val_base = sum(int(r["long_stay_30"]) for r in validation) / len(validation)

    candidates = []
    for key, n_train in train_counts.items():
        n_val = val_counts[key]
        if tuple(field for field, _ in key) not in DISPLAY_FAMILIES or n_train < MIN_TRAIN or n_val < MIN_VALIDATION:
            continue
        train_rate = train_pos[key] / n_train
        val_rate = val_pos[key] / n_val
        train_lift, val_lift = train_rate / train_base, val_rate / val_base
        # The later period is a screening filter, not independent confirmation.
        if train_lift < 1.15 or val_lift < MIN_VALIDATION_LIFT or val_pos[key] < 5:
            continue
        candidates.append({
            "conditions": dict(key),
            "training": {"matching": n_train, "long_stays": train_pos[key],
                         "rate": round(train_rate, 4), "support": round(n_train / len(train), 4),
                         "lift": round(train_lift, 3)},
            "validation": {"matching": n_val, "long_stays": val_pos[key],
                           "rate": round(val_rate, 4), "support": round(n_val / len(validation), 4),
                           "lift": round(val_lift, 3)},
        })

    # Rank using training data, with one pattern from each predefined field pair.
    candidates.sort(key=lambda r: (-r["training"]["lift"], -r["training"]["matching"]))
    selected = []
    for family in DISPLAY_FAMILIES:
        match = next((rule for rule in candidates if tuple(rule["conditions"]) == family), None)
        if match is not None:
            selected.append(match)

    result = {
        "method": "Exploratory intake-only association rules screened using training and later validation records",
        "target": "More than 30 days; descriptive association, not a cause or an individual prediction",
        "training_rows": len(train), "validation_rows": len(validation),
        "training_long_stay_rate": round(train_base, 4),
        "validation_long_stay_rate": round(val_base, 4),
        "minimum_training_matches": MIN_TRAIN,
        "minimum_validation_matches": MIN_VALIDATION,
        "minimum_validation_lift": MIN_VALIDATION_LIFT,
        "rules": selected,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(selected)} exploratory screened patterns to {args.output}")
    for rule in selected:
        print(rule["conditions"], rule["training"], rule["validation"])


if __name__ == "__main__":
    main()
