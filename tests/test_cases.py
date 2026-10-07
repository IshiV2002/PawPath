"""Check that local follow-ups preserve predictions and record real outcomes."""
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cases import add_case, delete_case, init_db, list_cases, update_case
from schemas import AnimalInput


class CaseStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_env = patch.dict(os.environ, {
            "PAWPATH_DB_PATH": str(Path(self.temp.name) / "cases.sqlite3")
        })
        self.db_env.start()
        init_db()
        self.intake = date.today() - timedelta(days=31)
        self.animal = AnimalInput(type="DOG", intake_date=self.intake)
        self.prediction = SimpleNamespace(
            predicted_stay_group="MORE_THAN_30_DAYS", model_name="saved-model"
        )

    def tearDown(self):
        self.db_env.stop()
        self.temp.cleanup()

    def test_outcome_boundary_and_prediction_history(self):
        saved = add_case(self.animal, self.prediction, "Bella", None, "Check later")
        self.assertEqual(saved["prediction_group"], "MORE_THAN_30_DAYS")
        self.assertIsNone(saved["actual_stay_group"])
        at_30 = update_case(saved["case_id"], {
            "outcome_date": self.intake + timedelta(days=30)
        })
        self.assertEqual(at_30["actual_stay_group"], "30_DAYS_OR_LESS")
        self.assertFalse(at_30["prediction_matched_outcome"])
        at_31 = update_case(saved["case_id"], {"outcome_date": date.today()})
        self.assertEqual(at_31["actual_stay_group"], "MORE_THAN_30_DAYS")
        self.assertTrue(at_31["prediction_matched_outcome"])
        self.assertEqual(at_31["prediction_group"], saved["prediction_group"])

    def test_invalid_outcome_and_deletion(self):
        saved = add_case(self.animal, self.prediction, "Bella", None, "")
        with self.assertRaises(ValueError):
            update_case(saved["case_id"], {
                "outcome_date": self.intake - timedelta(days=1)
            })
        with self.assertRaises(ValueError):
            update_case(saved["case_id"], {
                "outcome_date": date.today() + timedelta(days=1)
            })
        self.assertEqual(len(list_cases()), 1)
        self.assertTrue(delete_case(saved["case_id"]))
        self.assertEqual(list_cases(), [])


if __name__ == "__main__":
    unittest.main()
