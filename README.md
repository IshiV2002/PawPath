# PawPath — KND_04 shelter stay demo

PawPath has a shelter-staff web screen and a prediction API. The screen receives
animal details and predicts whether the shelter stay will be more than 30 days
or 30 days or less.
This is a local academic prototype using Sonoma County, California, USA data.
The saved model can be wrong; the result is not a guarantee or a care decision.

## Run on your Windows PC

Use **Python 3.12**. Clone this repository (or extract the ZIP), open its folder
in VS Code, and run these commands in that folder's terminal:

Then run these commands one at a time from that folder:

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

The screen is served by the same local FastAPI app, so it needs no separate
frontend installation or internet connection. It does not save entered details.
The animal illustration is decorative; it is not part of the prediction.
The entered name for **Other** appears in the result, but the saved model sees
only the broad **OTHER** type. Entering a different name does not change its score.

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
- `alert`: true when the unrounded score is at least the saved **0.20** cutoff.
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
are rejected. No data is stored by this API.

## Files and simple viva explanation

- **schemas.py**: “We check the user input and reject invalid dates or fields.”
- **predictor.py**: “We load the saved preprocessing and Random Forest once. We use
  the same 0.20 cutoff from Notebook 7.”
- **main.py**: “This receives requests and sends predictions back to the user screen.”
- **artifacts/**: original model, preprocessing helper and saved policy. Keep together.
- **tests/**: checks for valid/invalid requests, missing details, rare values,
  prediction consistency, the cutoff boundary and changed model files.

## Run the checks yourself

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The saved prediction examples are used to verify software consistency. They do not
create a new independent model evaluation. The original Notebook 7 policy retains
its historical pre-test flag; Notebook 8 is the record of completed final testing.

## Limits

This is a local academic prototype based on **Sonoma County, California, USA**.
The final test had 230 caught long stays, 84 missed long stays and 732 false alerts.
It has not been validated for Sri Lanka or live shelter decisions. Staff must make
the care decisions. The backend is not a deployment or evidence of welfare benefit.

The web screen and API are included. To help improve the project, see
[CONTRIBUTING.md](CONTRIBUTING.md). The group can add useful UI features and
include the finished demo in its report.

References: [FastAPI request bodies](https://fastapi.tiangolo.com/tutorial/body/),
[FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/).
