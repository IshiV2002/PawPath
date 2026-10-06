"""Load the saved Stage 6-8 preprocessing and selected stay classifier."""
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
    return bool(score >= threshold)


class ShelterPredictor:
    def __init__(self, folder=ARTIFACTS):
        self.folder = Path(folder)
        manifest = json.loads((self.folder / "artifact_manifest.json").read_text())
        for name, expected in manifest["sha256"].items():
            if Path(name).name != name or sha256(self.folder / name) != expected:
                raise RuntimeError(f"Saved file does not match: {name}. Restore the original artifacts folder.")

        self.policy = json.loads((self.folder / "selection_policy.json").read_text())
        model_path = self.folder / "selected_model.joblib"
        if sha256(model_path) != self.policy["model_sha256"]:
            raise RuntimeError("The model does not match its saved decision rule.")
        if sha256(self.folder / "shelter_preprocessing.py") != self.policy["helper_sha256"]:
            raise RuntimeError("The preprocessing code does not match the saved model.")

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
        helper_path = (self.folder / "shelter_preprocessing.py").resolve()
        if existing and Path(existing.__file__).resolve() != helper_path:
            raise RuntimeError("Another preprocessing module is loaded. Start this backend in its own Python process.")
        self.prep = importlib.import_module("shelter_preprocessing")

        import joblib
        from sklearn.exceptions import InconsistentVersionWarning
        with warnings.catch_warnings():
            warnings.simplefilter("error", InconsistentVersionWarning)
            bundle = joblib.load(model_path)

        if bundle.get("format_version") != 2:
            raise RuntimeError("Unsupported saved model bundle.")
        self.preprocessor = bundle["preprocessor"]
        self.model = bundle["model"]
        self.base_feature_names = bundle["base_feature_names"]
        self.model_feature_names = bundle["model_feature_names"]
        self.threshold = float(bundle["threshold"])
        self.encoded_feature_names = bundle["encoded_feature_names"]
        self.candidate_id = bundle["candidate_id"]

        if list(self.model.classes_) != [0, 1]:
            raise RuntimeError("Unexpected model classes.")
        if self.prep.RAW_INPUT_FIELDS != self.policy["raw_input_fields"]:
            raise RuntimeError("Unexpected input columns.")
        if list(self.preprocessor.get_feature_names_out()) != self.encoded_feature_names:
            raise RuntimeError("Preprocessor feature order does not match the saved model.")
        if self.preprocessor.named_steps["features"].fit_rows_ != self.policy["fit_rows"]:
            raise RuntimeError("Unexpected preprocessing training row count.")
        if not 0 <= self.threshold <= 1:
            raise RuntimeError("Invalid saved cutoff.")

    def _model_frame(self, raw_frame):
        import pandas as pd

        transformed = self.preprocessor.transform(raw_frame)
        frame = pd.DataFrame(transformed, columns=self.encoded_feature_names)
        frame = frame[self.base_feature_names].copy()
        for column in list(frame.columns):
            if column.startswith("categories__type_") or column.startswith("categories__intake_condition_"):
                frame["age_x_" + column] = frame["age__age_years"] * frame[column]
        if list(frame.columns) != self.model_feature_names:
            raise RuntimeError("Input feature order does not match the selected model.")
        return frame

    def predict(self, animal: AnimalInput):
        import numpy as np
        import pandas as pd

        record = animal.model_dump(mode="json")
        raw_frame = pd.DataFrame([record], columns=self.policy["raw_input_fields"])
        model_frame = self._model_frame(raw_frame)
        score = float(self.model.predict_proba(model_frame)[0, 1])
        if not np.isfinite(score) or not 0 <= score <= 1:
            raise RuntimeError("The model returned an invalid score.")
        alert = needs_review(score, self.threshold)

        # These notes describe input handling, not reasons for the predicted score.
        derived = self.prep.arrival_features(raw_frame).iloc[0]
        learned = self.preprocessor.named_steps["features"]
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
            threshold=self.threshold, model_name=self.candidate_id,
            target="Stay longer than 30 days", age_estimated=estimated, data_notes=notes,
            score_note="Model score, not a calibrated probability. Staff must make the care decision.",
            scope="Academic prototype using Sonoma County, California, USA data.")
