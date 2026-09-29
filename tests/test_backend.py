"""Meaningful API checks; run: python -m unittest discover -s tests -v"""
from pathlib import Path
from datetime import date, timedelta
import json
import shutil
import tempfile
import unittest
import joblib
from fastapi.testclient import TestClient
from main import app
from predictor import ShelterPredictor, ARTIFACTS, needs_review


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def test_saved_predictions_match(self):
        fixtures = json.loads((Path(__file__).parent / "saved_prediction_cases.json").read_text())
        before = joblib.hash(app.state.predictor.model)
        for fixture in fixtures:
            with self.subTest(case=fixture['case']):
                response = self.client.post('/predict', json=fixture['input'])
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertAlmostEqual(result['long_stay_score'], fixture['expected_score'], places=12)
                self.assertEqual(result['alert'], fixture['expected_alert'])
                self.assertEqual(result['predicted_stay_group'],
                                 'MORE_THAN_30_DAYS' if fixture['expected_alert'] else '30_DAYS_OR_LESS')
        self.assertEqual(before, joblib.hash(app.state.predictor.model))

    def test_unknown_optional_values(self):
        response = self.client.post('/predict', json={'type':'DOG','intake_date':'2026-01-10'})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()['age_estimated'])
        self.assertTrue(response.json()['data_notes'])

    def test_text_normalization(self):
        base={'type':'DOG','intake_date':'2026-01-10','sex':'MALE','breed':'LABRADOR RETR'}
        other=dict(base,type=' dog ',sex=' neutered ',breed=' labrador   retr ')
        self.assertEqual(self.client.post('/predict',json=base).json(),self.client.post('/predict',json=other).json())

    def test_new_category(self):
        response=self.client.post('/predict',json={'type':'DOG','intake_date':'2026-01-10','breed':'NEW DEMO BREED'})
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(any('Rare/new-category' in n for n in response.json()['data_notes']))

    def test_invalid_inputs(self):
        base={'type':'DOG','intake_date':'2026-01-10'}
        bad=[{},dict(base,type='HORSE'),dict(base,sex='MAYBE'),dict(base,intake_date='2026-02-30'),
             dict(base,intake_date=123),dict(base,intake_date='2026-W01-1'),dict(base,date_of_birth='2026-01-11'),
             dict(base,date_of_birth='bad date'),dict(base,breed=4),dict(base,breed='x'*121),
             dict(base,intake_date=(date.today()+timedelta(days=1)).isoformat()),
             dict(base,long_stay_30=1),dict(base,days_in_shelter=40),dict(base,threshold=0.9)]
        for payload in bad:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/predict',json=payload).status_code,422)

    def test_routes_and_schema(self):
        self.assertEqual(self.client.get('/health').json(),{'status':'ready','model_loaded':True})
        self.assertEqual(self.client.get('/model-info').json()['threshold'],0.2)
        self.assertEqual(self.client.get('/').status_code,200)
        schema=self.client.get('/openapi.json').json()
        self.assertEqual(set(schema['components']['schemas']['AnimalInput']['required']),{'type','intake_date'})

    def test_cutoff_boundary(self):
        self.assertTrue(needs_review(0.20,0.20))
        self.assertFalse(needs_review(0.199999,0.20))

    def test_changed_model_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            for p in ARTIFACTS.iterdir():
                if p.is_file():shutil.copyfile(p,folder/p.name)
            with (folder/'selected_model.joblib').open('ab') as f:f.write(b'changed')
            with self.assertRaisesRegex(RuntimeError,'does not match'):
                ShelterPredictor(folder)


if __name__=='__main__':
    unittest.main()
