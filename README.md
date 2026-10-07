# PawPath — KND_04 shelter stay demo

PawPath has a shelter-staff web screen and a prediction API. The screen receives
animal details and predicts whether the shelter stay will be more than 30 days
or 30 days or less.
This is a local academic prototype using Sonoma County, California, USA data.
The saved model can be wrong; the result is not a guarantee or a care decision.
Staff can save a follow-up, later record a departure date, and view historical
group patterns screened against a later validation period.

## Run on your Windows PC

Use **Python 3.12**. Clone this repository (or extract the ZIP), open its folder
in VS Code, and run these commands one at a time in that folder's terminal:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe start_backend.py
```

The first command creates an isolated Python environment. The second installs
the matching libraries. The last starts the service. Keep that terminal open.
Using the environment's Python directly avoids PowerShell activation-policy issues.

If `py -3.12` is unavailable, install Python 3.12 and rerun the commands.
The model libraries are pinned to the versions used when this model was saved.

## Use the animal-friendly screen

1. If the server is already running, press **Ctrl+C** in its terminal, then run
   `.\.venv\Scripts\python.exe start_backend.py` again from this folder.
2. Open **http://127.0.0.1:8000/** in your browser.
3. Choose dog, cat, or other, and enter the intake date. If you choose **Other**,
   enter the animal name (for example, rabbit). The remaining fields are optional.
   Use **Try an example** to fill in sample details quickly.
4. Click **Predict stay**. The screen gives one clear answer: **More than 30 days**
   or **30 days or less**. It is a prediction, not a guaranteed stay length.
5. Use **Print Kennel Tag** to generate a print-formatted shelter intake tag with a
   staff care checklist, or **Copy Record** to copy structured intake notes to your clipboard.
6. Choose **Save follow-up** to add a case label, review date and staff note. The
   **Saved follow-ups** board can mark a review done and record a real departure
   date. The actual stay appears only after a departure date is entered.
7. **Patterns in past admissions** shows group counts from older training records
   and later validation records. These are exploratory associations, not explanations for an
   individual animal or instructions to change its care.

The screen is served by the same local FastAPI app, so it needs no separate
frontend installation or internet connection. Entered details are saved only
when **Save follow-up** is clicked. Saved cases stay in the local file
`data/pawpath.sqlite3`, which Git ignores; another PC does not see them. Use
**Delete case** to remove a saved case. This is a local demonstration bound to
127.0.0.1, without user accounts or shared access.
The animal illustration is decorative; it is not part of the prediction.
The entered name for **Other** appears in the result, but the saved model sees
only the broad **OTHER** type. Entering a different name does not change its score.

The case API also offers `POST /cases`, `GET /cases`, `PATCH /cases/{case_id}` and
`DELETE /cases/{case_id}`. `POST /cases` recomputes the prediction on the server;
the browser cannot submit an invented predicted group. A departure date must be
between intake and today. A stay of exactly 30 days belongs to the shorter group.

## Try the API directly

1. Open **http://127.0.0.1:8000/docs** in your browser.
2. Expand **POST /predict**.
3. Click **Try it out**. A complete example is already provided.
4. Click **Execute**.
5. Look for status **200** and the JSON response.

This is FastAPI's interactive API test page, separate from the shelter-staff screen.
It loads its Swagger interface from an external CDN, so it needs browser internet
access. The API itself runs locally. If the page is unavailable, use PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/predict' -ContentType 'application/json' -Body (Get-Content sample_request.json -Raw)
```

Stop the service with **Ctrl+C**. If port 8000 is already occupied, stop your earlier
copy, or use `.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001`.

## What the response means

- `long_stay_score`: the model's score between 0 and 1; not a confirmed probability.
- `predicted_stay_group`: the direct 30-day classification shown on the screen.
- `alert`: true when the unrounded score is at least the saved **0.375833** cutoff.
- `decision`: review suggested, or no alert at this cutoff. No alert is not a guarantee.
- `age_estimated`: whether a missing birth date used the saved training-data age estimate.
- `data_notes`: how missing and rare/new input values were handled. These are not
  explanations of what caused a high score.

An error with status **422** means the input is invalid. Read `detail` to find the field.
Animal type and intake date are required. Optional blank/null categories become
UNKNOWN. Blank or null birth dates are allowed. Birth date must not be after intake;
intake must not be in the future. Dates before 1900 are rejected as outside this
prototype's accepted date range. The API accepts YYYY-MM-DD dates only.

Types: DOG, CAT, OTHER. Sex: MALE, FEMALE, UNKNOWN; NEUTERED/SPAYED aliases are also
accepted and mapped to biological sex as in preprocessing. Put species outside dogs
and cats under OTHER, as in the dataset. Optional categories accept text and the
saved pipeline handles rare/new values. Outcome fields and caller-supplied cutoffs
are rejected. **POST /predict** does not store data; **POST /cases** stores a
follow-up on this computer only when you choose to save it.

## Files and simple viva explanation

- **schemas.py**: “We check the user input and reject invalid dates or fields.”
- **predictor.py**: “We load the saved Step 5 preprocessing and tuned Random Forest once.
  The review cutoff of 0.375833 was chosen on validation data.”
- **main.py**: “This receives prediction requests and lets staff save follow-ups.”
- **cases.py**: “This saves local follow-ups and records actual departure dates later.”
- **analysis/**: “This checks older-to-later model results and finds historical group patterns.”
- **artifacts/**: original model, preprocessing helper and saved policy. Keep together.
- **tests/**: checks for valid/invalid requests, missing details, rare values,
  prediction consistency, the cutoff boundary and changed model files.

## Run the checks yourself

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The active model is the tuned Random Forest selected in
`Stage_6_7_8_Model_Development.ipynb`, with age-interaction features. It uses 400
trees, `min_samples_leaf=1`, `max_features=0.5`, no maximum depth, and no class
weighting. The 0.375833 decision cutoff maximizes positive-class F1 on the
validation set. It is not the earlier Notebook 7 model or its 0.20 cutoff.

On the held-out test split (1,672 admissions), the model scored **73.3% accuracy**,
**56.9% balanced accuracy**, **30.6% long-stay recall**, **30.0% positive-class F1**,
and **0.318 average precision**. The majority-class dummy scored **81.2% accuracy**
with **0% long-stay recall**. Accuracy alone is misleading for this imbalanced
test set; the model’s accuracy is lower than the dummy baseline, while it identifies
some long stays. The test confusion matrix (actual rows 0/1, predicted columns 0/1)
is `[[1129, 229], [218, 96]]`.

The saved prediction examples check that this bundled model and preprocessor remain
loadable and consistent. They are not a new independent model evaluation.

## Limits

This is a local academic prototype based on **Sonoma County, California, USA**.
The final test had 96 caught long stays, 218 missed long stays, and 229 false alerts.
It has not been validated for Sri Lanka or live shelter decisions. Staff must make
the care decisions. The backend is not a deployment or evidence of welfare benefit.

The web screen and API are included. To help improve the project, see
[CONTRIBUTING.md](CONTRIBUTING.md). The group can add useful UI features and
include the finished demo in its report.

## New analysis evidence

`analysis/association_rules.py` reads the raw training and validation admission
CSVs from the earlier notebook workflow. It uses only intake details and the
historical target, keeps aggregate counts, and writes `frontend/insights.json`.
The four patterns were selected using both training and validation records, so
their displayed validation rates are exploratory, not independent confirmation.
The committed JSON contains no animal IDs or names and uses no test labels. To
refresh it with the original CSVs placed in
the sibling `step3_results` folder, run:

```powershell
.\.venv\Scripts\python.exe analysis/association_rules.py --records-dir ..\step3_results
```

`analysis/temporal_validation.py` checks four model families and the selected
forest on three older-to-later folds inside training data. Each fold learns
preprocessing from its own older rows, leaves a 31-day gap, and keeps animal IDs
out of both sides. It does not read validation/test CSVs, select a new deployed
model or replace the saved test result. The same check can be run from
`analysis/Temporal_Validation_Audit.ipynb` after opening this repository as the
notebook working folder. Or reproduce it in the terminal with:

```powershell
.\.venv\Scripts\python.exe analysis/temporal_validation.py --records-dir ..\step3_results
```

The resulting evidence is in `analysis/temporal_validation_results.csv` and
`.json`. See [analysis/EVIDENCE.md](analysis/EVIDENCE.md) before citing these
figures in a report. Source dataset: [County of Sonoma Animal Shelter Intake and
Outcome](https://data.sonomacounty.ca.gov/Government/Animal-Shelter-Intake-and-Outcome/924a-vesw).

References: [FastAPI request bodies](https://fastapi.tiangolo.com/tutorial/body/),
[FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/).
