"""Local follow-up cases. Predictions stay separate from later observed outcomes."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4


DEFAULT_DB = Path(__file__).resolve().parent / "data" / "pawpath.sqlite3"
EDITABLE = {"review_date", "review_note", "review_done", "outcome_date"}


def db_path():
    return Path(os.environ.get("PAWPATH_DB_PATH", DEFAULT_DB))


@contextmanager
def connection():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    with connection() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS cases (
            case_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            animal_label TEXT NOT NULL,
            animal_type TEXT NOT NULL,
            intake_date TEXT NOT NULL,
            inputs_json TEXT NOT NULL,
            prediction_group TEXT NOT NULL,
            model_name TEXT NOT NULL,
            review_date TEXT,
            review_note TEXT NOT NULL DEFAULT '',
            review_done INTEGER NOT NULL DEFAULT 0,
            outcome_date TEXT
        )""")


def public_case(row):
    result = dict(row)
    result.pop("inputs_json")
    result["review_done"] = bool(result["review_done"])
    result["actual_stay_days"] = None
    result["actual_stay_group"] = None
    result["prediction_matched_outcome"] = None
    if result["outcome_date"]:
        days = (date.fromisoformat(result["outcome_date"]) - date.fromisoformat(result["intake_date"])).days
        actual = "MORE_THAN_30_DAYS" if days > 30 else "30_DAYS_OR_LESS"
        result["actual_stay_days"] = days
        result["actual_stay_group"] = actual
        result["prediction_matched_outcome"] = result["prediction_group"] == actual
    return result


def add_case(animal, prediction, label, review_date, note):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    case_id = uuid4().hex
    with connection() as db:
        db.execute("""INSERT INTO cases (
            case_id, created_at, updated_at, animal_label, animal_type, intake_date,
            inputs_json, prediction_group, model_name, review_date, review_note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", (
            case_id, now, now, label.strip(), animal.type, animal.intake_date.isoformat(),
            json.dumps(animal.model_dump(mode="json")), prediction.predicted_stay_group,
            prediction.model_name, review_date.isoformat() if review_date else None, note.strip(),
        ))
        row = db.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    return public_case(row)


def list_cases():
    with connection() as db:
        rows = db.execute("SELECT * FROM cases ORDER BY created_at DESC LIMIT 500").fetchall()
    return [public_case(row) for row in rows]


def update_case(case_id, changes):
    if not changes or not set(changes).issubset(EDITABLE):
        raise ValueError("No editable fields were provided.")
    with connection() as db:
        before = db.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
        if before is None:
            return None
        review = changes.get("review_date")
        if review is not None and "review_date" in changes and review < date.fromisoformat(before["intake_date"]):
            raise ValueError("Review date cannot be before intake date.")
        outcome = changes.get("outcome_date")
        if outcome is not None and "outcome_date" in changes:
            if outcome < date.fromisoformat(before["intake_date"]) or outcome > date.today():
                raise ValueError("Outcome date must be between intake date and today.")
        values = {
            name: (value.isoformat() if isinstance(value, date) else int(value) if isinstance(value, bool) else value)
            for name, value in changes.items()
        }
        if (("review_note" in values and values["review_note"] is None)
                or ("review_done" in values and values["review_done"] is None)):
            raise ValueError("Review note and review status cannot be null.")
        values["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        assignments = ", ".join(f"{name} = ?" for name in values)
        db.execute(f"UPDATE cases SET {assignments} WHERE case_id = ?", (*values.values(), case_id))
        after = db.execute("SELECT * FROM cases WHERE case_id = ?", (case_id,)).fetchone()
    return public_case(after)


def delete_case(case_id):
    with connection() as db:
        deleted = db.execute("DELETE FROM cases WHERE case_id = ?", (case_id,)).rowcount
    return deleted > 0
