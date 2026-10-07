KND_04 - Step 5 results

Keep this folder together. Tested versions are in requirements_preprocessing.txt.
This is preprocessing only: no trained classifier or measured model accuracy exists yet.

The fitted pipeline requires shelter_preprocessing.py to be importable.
To reload in a notebook:
    from pathlib import Path
    import sys, joblib
    folder = Path('step5_results').resolve()
    sys.path.insert(0, str(folder))
    pipeline = joblib.load(folder / 'preprocessing_pipeline.joblib')
    numeric_inputs = pipeline.transform(new_arrival_dataframe)

new_arrival_dataframe must contain the 10 raw input columns in preprocessing_notes.json.
Birth date may be missing, but intake date must be valid.
Use the same dependency versions when loading the saved pipeline.

For fresh training or time/group-aware tuning, import make_preprocessor from
shelter_preprocessing and put it before the classifier in a new sklearn Pipeline.
Fit inside each training fold. Do not fit on validation/test inputs, and do not
cross-validate already transformed whole-training arrays.

prepared_arrays.npz can be opened with numpy.load(..., allow_pickle=False).
X_train, X_validation and X_test share the feature_names order.
y_train, y_validation and y_test are separate targets, aligned by row_numbers_*.
row_audit.csv contains bookkeeping/target columns that must not become model inputs.

Changing the preprocessing rules requires rerunning this notebook and subsequent
model steps. Keep split dates fixed and reserve test evaluation until choices are final.
