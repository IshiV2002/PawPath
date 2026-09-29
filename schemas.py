"""Check the animal details before sending them to the saved model."""
from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AnimalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"example": {
        "type": "DOG", "breed": "LABRADOR RETR", "color": "BLACK",
        "sex": "MALE", "date_of_birth": "2023-01-01", "intake_date": "2026-01-10",
        "intake_type": "STRAY", "intake_subtype": "FIELD",
        "intake_condition": "UNKNOWN", "intake_jurisdiction": "SANTA ROSA"}})

    type: Literal["DOG", "CAT", "OTHER"]
    intake_date: date
    date_of_birth: date | None = None
    breed: str = Field(default="UNKNOWN", max_length=120)
    color: str = Field(default="UNKNOWN", max_length=120)
    sex: Literal["MALE", "FEMALE", "UNKNOWN"] = "UNKNOWN"
    intake_type: str = Field(default="UNKNOWN", max_length=120)
    intake_subtype: str = Field(default="UNKNOWN", max_length=120)
    intake_condition: str = Field(default="UNKNOWN", max_length=120)
    intake_jurisdiction: str = Field(default="UNKNOWN", max_length=120)

    @field_validator("type", "breed", "color", "sex", "intake_type", "intake_subtype",
                     "intake_condition", "intake_jurisdiction", mode="before")
    @classmethod
    def clean_text(cls, value):
        if value is None:
            return "UNKNOWN"
        if not isinstance(value, str):
            raise ValueError("Use text for this field.")
        text = " ".join(value.strip().upper().split())
        return "UNKNOWN" if text in {"", "UNK", "UNSPECIFIED", "NOT RECORDED"} else text

    @field_validator("sex", mode="before")
    @classmethod
    def biological_sex(cls, value):
        if isinstance(value, str):
            value = " ".join(value.strip().upper().split())
            value = {"NEUTERED": "MALE", "NEUTERED MALE": "MALE",
                     "SPAYED": "FEMALE", "SPAYED FEMALE": "FEMALE"}.get(value, value)
        return value

    @field_validator("intake_date", "date_of_birth", mode="before")
    @classmethod
    def read_date(cls, value, info):
        if info.field_name == "date_of_birth" and value in (None, ""):
            return None
        if isinstance(value, date) and type(value) is date:
            return value
        if (not isinstance(value, str) or len(value) != 10 or value[4] != "-"
                or value[7] != "-" or not (value[:4] + value[5:7] + value[8:]).isdigit()):
            raise ValueError("Use a date in YYYY-MM-DD format.")
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise ValueError("Use a real date in YYYY-MM-DD format.") from None

    @model_validator(mode="after")
    def check_date_order(self):
        if self.intake_date < date(1900, 1, 1) or self.intake_date > date.today():
            raise ValueError("Intake date must be from 1900-01-01 through today.")
        if self.date_of_birth is not None:
            if self.date_of_birth < date(1900, 1, 1):
                raise ValueError("Birth date must be on or after 1900-01-01.")
            if self.date_of_birth > self.intake_date:
                raise ValueError("Birth date cannot be after intake date.")
        return self


class PredictionOutput(BaseModel):
    long_stay_score: float = Field(ge=0, le=1)
    alert: bool
    predicted_stay_group: Literal["MORE_THAN_30_DAYS", "30_DAYS_OR_LESS"]
    decision: str
    threshold: float
    model_name: str
    target: str
    age_estimated: bool
    data_notes: list[str]
    score_note: str
    scope: str
