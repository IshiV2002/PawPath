
"""KND_04 reusable preprocessing. Fit on training admissions only."""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.validation import check_is_fitted

RAW_INPUT_FIELDS = [
    "type", "breed", "color", "sex", "date_of_birth", "intake_date",
    "intake_type", "intake_subtype", "intake_condition", "intake_jurisdiction",
]
CATEGORICAL_FIELDS = [
    "type", "breed", "color", "biological_sex", "intake_type",
    "intake_subtype", "intake_condition", "intake_jurisdiction",
]
RARE_FIELDS = ["breed", "color", "intake_subtype"]
NUMERIC_FIELDS = ["age_years", "age_missing", "intake_month_sin", "intake_month_cos"]
UNKNOWN = "UNKNOWN"
RARE = "__RARE_OR_NEW__"


def normalize_category(values):
    """Standardise spelling format without guessing what a category means."""
    clean = values.astype("string").str.strip().str.upper().str.replace(r"\s+", " ", regex=True)
    clean = clean.fillna(UNKNOWN)
    return clean.replace({"": UNKNOWN, "UNK": UNKNOWN, "UNSPECIFIED": UNKNOWN,
                          "NOT RECORDED": UNKNOWN})


def arrival_features(records):
    """Deterministic features only: this function learns no dataset statistics."""
    missing_columns = sorted(set(RAW_INPUT_FIELDS) - set(records.columns))
    if missing_columns:
        raise ValueError("Missing input columns: " + ", ".join(missing_columns))
    selected = records[RAW_INPUT_FIELDS].copy()
    result = pd.DataFrame(index=records.index)
    for column in CATEGORICAL_FIELDS:
        if column != "biological_sex":
            result[column] = normalize_category(selected[column])
    sex_mapping = {
        "MALE": "MALE", "NEUTERED": "MALE", "NEUTERED MALE": "MALE",
        "FEMALE": "FEMALE", "SPAYED": "FEMALE", "SPAYED FEMALE": "FEMALE",
    }
    result["biological_sex"] = normalize_category(selected["sex"]).map(sex_mapping).fillna(UNKNOWN)

    intake = pd.to_datetime(selected["intake_date"], errors="coerce", format="mixed").dt.normalize()
    if intake.isna().any():
        raise ValueError("Each prediction needs a valid intake date; do not guess this date.")
    birth = pd.to_datetime(selected["date_of_birth"], errors="coerce", format="mixed").dt.normalize()
    age = (intake - birth).dt.days / 365.25
    result["age_years"] = age.where(age >= 0)
    result["age_missing"] = result["age_years"].isna().astype(int)
    # The circle puts December next to January, instead of at opposite ends.
    angle = 2 * np.pi * (intake.dt.month - 1) / 12
    result["intake_month_sin"] = np.sin(angle)
    result["intake_month_cos"] = np.cos(angle)
    return result[CATEGORICAL_FIELDS + NUMERIC_FIELDS]


class ShelterFeatures(BaseEstimator, TransformerMixin):
    """Learn age replacements and category grouping from the fit data only."""
    def __init__(self, rare_min_count=10):
        self.rare_min_count = rare_min_count

    def fit(self, X, y=None):
        if not isinstance(self.rare_min_count, int) or self.rare_min_count < 1:
            raise ValueError("rare_min_count must be a positive integer.")
        features = arrival_features(X)
        self.global_age_median_ = float(features["age_years"].median())
        if not np.isfinite(self.global_age_median_):
            raise ValueError("Training data contains no valid ages; an age replacement cannot be learned.")
        self.age_medians_by_type_ = features.groupby("type")["age_years"].median().dropna().to_dict()
        self.kept_categories_ = {}
        for column in CATEGORICAL_FIELDS:
            frequency = features[column].value_counts()
            keep = frequency[frequency >= self.rare_min_count].index if column in RARE_FIELDS else frequency.index
            self.kept_categories_[column] = set(keep) | {UNKNOWN}
        self.fit_rows_ = len(X)
        return self

    def transform(self, X):
        check_is_fitted(self, "kept_categories_")
        features = arrival_features(X)
        replacement = features["type"].map(self.age_medians_by_type_).fillna(self.global_age_median_)
        features["age_years"] = features["age_years"].fillna(replacement)
        for column in CATEGORICAL_FIELDS:
            features[column] = features[column].where(
                features[column].isin(self.kept_categories_[column]), RARE
            )
        return features[CATEGORICAL_FIELDS + NUMERIC_FIELDS]

    def get_feature_names_out(self, input_features=None):
        return np.array(CATEGORICAL_FIELDS + NUMERIC_FIELDS, dtype=object)


class CategoryEncoder(BaseEstimator, TransformerMixin):
    """One-hot encoding with explicit slots for unavailable and new categories."""
    def fit(self, X, y=None):
        self.feature_names_in_ = np.array(X.columns, dtype=object)
        # Reserved slots do not add artificial rows. Their values are fixed constants.
        categories = [sorted(set(X[column]) | {UNKNOWN, RARE}) for column in X.columns]
        self.encoder_ = OneHotEncoder(categories=categories, handle_unknown="ignore", sparse_output=False)
        self.encoder_.fit(X)
        return self

    def transform(self, X):
        check_is_fitted(self, "encoder_")
        return self.encoder_.transform(X)

    def get_feature_names_out(self, input_features=None):
        check_is_fitted(self, "encoder_")
        return self.encoder_.get_feature_names_out(self.feature_names_in_ if input_features is None else input_features)


def make_preprocessor(rare_min_count=10):
    """Return a NEW, unfitted pipeline, including feature preparation."""
    columns = ColumnTransformer([
        ("age", StandardScaler(), ["age_years"]),
        ("flags_and_month", "passthrough", ["age_missing", "intake_month_sin", "intake_month_cos"]),
        ("categories", CategoryEncoder(), CATEGORICAL_FIELDS),
    ], remainder="drop", sparse_threshold=0)
    return Pipeline([("features", ShelterFeatures(rare_min_count=rare_min_count)), ("columns", columns)])

