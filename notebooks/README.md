# PawPath project notebooks and saved evidence

These files show the group's data preparation, modelling, and evaluation work. The source is the [County of Sonoma Animal Shelter Intake and Outcome dataset](https://data.sonomacounty.ca.gov/Government/Animal-Shelter-Intake-and-Outcome/924a-vesw), specific to Sonoma County, California, USA. The saved snapshot uses 14 September 2026 as its observation date.

## Reading order

1. `KND_04_Step_1_Understand_Our_Data.ipynb` — inspect the original dataset.
2. `KND_04_Step_2_Create_The_Target.ipynb` — define the 30-day stay label; saved files are in `step2_results/`.
3. `KND_04_Step_3_Split_The_Data.ipynb` — create the time-based train, validation, and test groups; saved files are in `step3_results/`.
4. `KND_04_Step_4_Explore_Training_Data.ipynb` — explore training records and make charts; saved files are in `step4_results/`.
5. `KND_04_Step_5_Preprocess_The_Data.ipynb` — prepare inputs for modelling; saved files are in `step5_results/`.
6. `KND_04_Step_6_Compare_Four_Models.ipynb`, `KND_04_Step_7_Tune_The_Models.ipynb`, and `KND_04_Step_8_Test_Our_Final_Model.ipynb` — **earlier modelling experiments**. Their input bundles are the matching Step 6, 7, and 8 ZIP files in this folder.
7. `Stage_6_7_8_Model_Development.ipynb` — **later revised modelling work used to choose the model in the current PawPath backend**. Its input is `KND_04_Preprocessed_All_Splits_With_Labels.csv` in this folder.
8. `KND_04_Step_9_Understand_Our_Results.ipynb` — interpretation of the earlier Step 8 results. Read it as historical analysis, not current backend performance.

The current application model and its test metrics are recorded in `../artifacts/selection_policy.json`. Do not combine its metrics with those of the earlier Step 8 model. The Step 2–5 folders are saved outputs from the group's original run, not a fresh download of the live open-data portal. The original raw source CSV is not duplicated here; obtain it from the County of Sonoma link above. The processed CSV includes labels for all three splits for reproducing the revised analysis, but the test labels must never be used to choose a model or threshold.
