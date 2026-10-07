# PawPath analysis evidence for KND_04

This note explains what the new analysis shows and what it does not show. It is
written for the project report and viva. The active prediction model was **not**
changed by either analysis.

## 1. Older-to-later model check

The older modelling notebook used stratified cross-validation on a CSV that had
already been preprocessed. That can let information from the future fold affect
the preprocessing fitted for the past fold. Repeated animal IDs can also land on
both sides. For this extra check, `temporal_validation.py` starts from the raw
Step 3 **training** admissions and fits the preprocessor again inside each fold.
It trains on earlier admissions, leaves a 31-day gap, and checks later admissions.
Any animal ID in the later part is removed from the earlier part. All three folds
had zero animal IDs in common.

| Fold | Later intake dates | Earlier rows | Later rows | Later long-stay share |
| --- | --- | ---: | ---: | ---: |
| 1 | 2024-07-01 to 2024-10-31 | 3,530 | 925 | 35.1% |
| 2 | 2024-11-01 to 2025-02-28 | 4,428 | 733 | 28.6% |
| 3 | 2025-03-01 to 2025-05-30 | 5,225 | 659 | 22.0% |

The average precision (AP) values below are **means across these three folds**, not
test results. AP measures how well the model ranks true long stays above other
admissions over different decision cutoffs. The long-stay share changes across
folds, so these means are descriptive rather than a fair single-number contest.

| Model fitted in each fold | Mean AP |
| --- | ---: |
| Logistic regression | 0.62781 |
| Linear SVM | 0.62537 |
| Random forest baseline | 0.66409 |
| Gradient boosting baseline | 0.66525 |
| Selected tuned forest with age interactions | 0.63469 |

The selected tuned forest did **not** score highest in this extra check. We should
say that openly in the viva. It suggests the selected model may not generalize as
well to later periods as expected. We did not use these folds to change the live
model or to claim a better test result. Any new selection would require a fresh
group decision and a properly documented model comparison. A retrospective source
file also cannot prove that every intake field was recorded before the outcome.

The formal held-out test result of the current bundled model remains: 1,672
admissions, 73.3% accuracy, 29.5% precision, 30.6% recall, and about 30.0% F1
for long stays. It caught 96 long stays, missed 218, and gave 229 wrong long-stay
answers. Those figures come from the saved model policy and are **not** results of
this new fold check. The test split was not read by `temporal_validation.py`.

## 2. Historical group patterns

`association_rules.py` counts combinations of two simple intake attributes and
the long-stay label. It starts from 6,096 training records and screens the
patterns on 1,163 later validation records. Only four predefined attribute pairs
are considered for display. A pattern needs at least 80 training matches, 25
validation matches, and a validation long-stay rate at least 1.2 times the
validation-wide rate. One pattern per attribute pair is shown. The validation
data therefore **helped choose the displayed patterns**; their validation numbers
are not an untouched confirmation or a new model evaluation. The test split is
not used.

For example, 126 later validation admissions were recorded as under one year old
and healthy at intake; 48 of those had stays over 30 days (38.1%). The overall
later validation rate was 21.1%. In older training data, the same pair had 564
long stays out of 812 (69.5%). This large change between periods is important:
the screen displays both counts and does not promise the same rate today.

These are **associations**, not causes, rules for changing care, or explanations
of a particular model prediction. Some intake fields in the public snapshot may
have been edited later; we cannot confirm their original timestamp from this
file alone. The published `frontend/insights.json` contains group counts only,
without animal IDs or names.

## 3. Staff follow-up and real outcomes

When a user clicks **Save follow-up**, the backend predicts again from the entered
animal details and stores the group, input snapshot, optional label, review date,
and note in local SQLite. Later, staff can mark the review done and enter a real
departure date. The site then calculates actual days in shelter and shows whether
the earlier predicted group matched. Exactly 30 days belongs to the
"30 days or less" group. An outcome is never invented from the model score.

The database is `data/pawpath.sqlite3` on the machine running the backend. It is
ignored by Git and is not shared between group members. The app has no accounts
and is bound to localhost. This is a working prototype for demonstrating a
feedback loop, not a live shelter system or evidence that the model improves
animal welfare.

## Short viva wording

“We checked our models again using older records to predict later records. We
refitted preprocessing inside every training fold and kept the same animal out
of both sides. The selected model was not strongest in this extra check, so we
show it as a limitation. We also found group patterns in intake records, but
these patterns are descriptive. Our website lets staff save a predicted stay and
later enter the real departure date, so we can see whether the prediction was
right. We did not retrain or replace the approved model in this update.”
