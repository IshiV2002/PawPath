"""Load once; reuse the exact saved preprocessing, model and cutoff."""
from pathlib import Path
import hashlib
import importlib
import importlib.metadata
import json
import sys
import warnings
from schemas import AnimalInput, PredictionOutput

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def needs_review(score, threshold):
    # Do not round before deciding: 0.20 itself must trigger an alert.
    return bool(score >= threshold)


class ShelterPredictor:
    def __init__(self, folder=ARTIFACTS):
        self.folder = Path(folder)
        manifest = json.loads((self.folder / "artifact_manifest.json").read_text())
        for name, expected in manifest["sha256"].items():
            if Path(name).name != name or sha256(self.folder / name) != expected:
                raise RuntimeError(f"Saved file does not match: {name}. Restore the original artifacts folder.")
        self.policy = json.loads((self.folder / "selection_policy.json").read_text())
        if sha256(self.folder / "selected_model.joblib") != self.policy["model_sha256"]:
            raise RuntimeError("The model does not match its saved decision rule.")
        if sha256(self.folder / "shelter_preprocessing.py") != self.policy["helper_sha256"]:
            raise RuntimeError("The preprocessing code does not match the model.")

        # Pickled scikit-learn models need their original core library versions.
        packages = {"pandas": "pandas", "numpy": "numpy", "scikit-learn": "sklearn",
                    "scipy": "scipy", "joblib": "joblib"}
        for package, module_name in packages.items():
            expected = self.policy["versions"][package]
            try:
                actual = importlib.metadata.version(package)
            except importlib.metadata.PackageNotFoundError:
                actual = "missing"
            if actual != expected:
                raise RuntimeError(f"{package}: need {expected}, found {actual}. Install requirements.txt in a fresh environment.")
            module = importlib.import_module(module_name)
            if module.__version__ != expected:
                raise RuntimeError(f"Restart Python to use {package} {expected}.")

        sys.path.insert(0, str(self.folder.resolve()))
        existing = sys.modules.get("shelter_preprocessing")
        if existing and Path(existing.__file__).resolve() != (self.folder / "shelter_preprocessing.py").resolve():
            raise RuntimeError("Another preprocessing module is loaded. Start this backend in its own Python process.")
        self.prep = importlib.import_module("shelter_preprocessing")
        import joblib
        from sklearn.exceptions import InconsistentVersionWarning
        with warnings.catch_warnings():
            warnings.simplefilter("error", InconsistentVersionWarning)
            self.model = joblib.load(self.folder / "selected_model.joblib")
        if list(self.model.named_steps["model"].classes_) != [0, 1]:
            raise RuntimeError("Unexpected model classes.")
        if self.prep.RAW_INPUT_FIELDS != self.policy["raw_input_fields"]:
            raise RuntimeError("Unexpected input columns.")
        if self.model.named_steps["preprocess"].named_steps["features"].fit_rows_ != 6096:
            raise RuntimeError("Unexpected training row count.")
        self.threshold = float(self.policy["alert_threshold"])
        if not 0 <= self.threshold <= 1:
            raise RuntimeError("Invalid saved cutoff.")

    def predict(self, animal: AnimalInput):
        import numpy as np
        import pandas as pd
        record = animal.model_dump(mode="json")
        frame = pd.DataFrame([record], columns=self.policy["raw_input_fields"])
        score = float(self.model.predict_proba(frame)[0, 1])
        if not np.isfinite(score) or not 0 <= score <= 1:
            raise RuntimeError("The model returned an invalid score.")
        alert = needs_review(score, self.threshold)

        # These notes describe input handling, not reasons for the predicted score.
        derived = self.prep.arrival_features(frame).iloc[0]
        learned = self.model.named_steps["preprocess"].named_steps["features"]
        estimated = bool(derived["age_missing"])
        notes = []
        if estimated:
            notes.append("Birth date is unavailable; age was estimated using training-data values.")
        unknown = [c for c in self.prep.CATEGORICAL_FIELDS if derived[c] == "UNKNOWN"]
        if unknown:
            notes.append("Details recorded as unknown: " + ", ".join(unknown) + ".")
        grouped = [c for c in self.prep.CATEGORICAL_FIELDS if derived[c] not in learned.kept_categories_[c]]
        if grouped:
            notes.append("Rare/new-category handling used for: " + ", ".join(grouped) + ".")
        return PredictionOutput(
            long_stay_score=score, alert=alert,
            predicted_stay_group="MORE_THAN_30_DAYS" if alert else "30_DAYS_OR_LESS",
            decision="Review suggested" if alert else "No alert at the current cutoff",
            threshold=self.threshold, model_name=self.policy["candidate"]["candidate_id"],
            target="Stay longer than 30 days", age_estimated=estimated, data_notes=notes,
            score_note="Model score, not a calibrated probability. Staff must make the care decision.",
            scope="Academic prototype using Sonoma County, California, USA data.")
