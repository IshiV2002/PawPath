"""The API: receive animal details and return a model score and review alert."""
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from predictor import ShelterPredictor
from schemas import AnimalInput, PredictionOutput, CaseCreate, CaseUpdate
from cases import init_db, add_case, list_cases, update_case, delete_case


@asynccontextmanager
async def lifespan(app):
    app.state.predictor = ShelterPredictor()
    init_db()
    yield
    app.state.predictor = None


app = FastAPI(
    title="KND_04 Shelter Stay API", version="1.0.0",
    description="Local academic demonstration. Predicts a long-stay score using the selected Stages 6-8 Random Forest. "
                "Prediction requests are not stored. Follow-ups are saved only through POST /cases. "
                "The alert cutoff is fixed; this API does not train the model.",
    lifespan=lifespan)

FRONTEND = Path(__file__).resolve().parent / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(FRONTEND / "index.html")


@app.get("/health")
def health(request: Request):
    return {"status": "ready", "model_loaded": request.app.state.predictor is not None}


@app.get("/model-info")
def model_info(request: Request):
    predictor = request.app.state.predictor
    return {"model": predictor.candidate_id,
            "threshold": predictor.threshold, "training_rows": predictor.policy["fit_rows"],
            "input_fields": predictor.policy["raw_input_fields"],
            "feature_variant": predictor.policy["candidate"]["feature_variant"],
            "test_metrics": predictor.policy["test_metrics"],
            "probabilities_calibrated": False,
            "scope": "Sonoma County, California, USA; academic prototype"}


@app.post("/predict", response_model=PredictionOutput)
def predict(animal: AnimalInput, request: Request):
    """Enter one admission. Type and intake date are required; other details can be unknown."""
    try:
        return request.app.state.predictor.predict(animal)
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=500, detail="Prediction could not be completed. Check the backend setup.") from None


@app.post("/cases", status_code=201)
def create_case(payload: CaseCreate, request: Request):
    """Save an intake prediction and an optional staff review plan."""
    prediction = request.app.state.predictor.predict(payload.animal)
    return add_case(payload.animal, prediction, payload.animal_label,
                    payload.review_date, payload.review_note)


@app.get("/cases")
def cases():
    return list_cases()


@app.patch("/cases/{case_id}")
def revise_case(case_id: str, payload: CaseUpdate):
    try:
        result = update_case(case_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    if result is None:
        raise HTTPException(status_code=404, detail="Saved case not found.")
    return result


@app.delete("/cases/{case_id}", status_code=204)
def remove_case(case_id: str):
    if not delete_case(case_id):
        raise HTTPException(status_code=404, detail="Saved case not found.")
    return Response(status_code=204)
