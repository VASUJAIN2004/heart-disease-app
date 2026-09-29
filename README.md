# Heartline — heart disease risk checker

A Flask + HTML/CSS/JS rebuild of the original Streamlit project. Same idea —
answer questions from a check-up, get a heart-disease risk estimate — with a
custom-designed front end and a corrected model.

## What changed from the Streamlit version

The original `KNN_heart.pkl` / `scaler.pkl` files were broken: the scaler had
been fit on already-scaled data, so the Streamlit app was feeding raw values
(e.g. cholesterol 200) into a model that expected numbers like -0.05. Testing
that exact pipeline against `heart.csv` gave 66% accuracy and flagged 79% of
patients as high-risk, against a true rate of 55%.

`model_service.py` retrains a clean pipeline from `data/heart.csv` every time
the server starts (about a second):

- missing cholesterol/blood-pressure (stored as `0` in this dataset) are
  imputed with the median instead of trained on as real zeros
- one `ColumnTransformer` + `StandardScaler` + `OneHotEncoder`, so training
  and prediction always see the same transformation
- `KNeighborsClassifier(n_neighbors=15)`, chosen by cross-validated accuracy
  across k = 5–25 and a few other model types (see the model-selection notes
  at the bottom of this file)

Cross-validated performance (5-fold, repeated 3 times): **~86% accuracy, 90%
sensitivity, 80% specificity**. These numbers are computed at startup and
shown on the page itself, so they can't drift out of sync with the code.

## Project structure

```
heart-disease-app/
├── app.py               Flask routes + input validation
├── model_service.py     Data cleaning, training, prediction, explanations
├── data/heart.csv        Training data (918 rows)
├── templates/index.html
├── static/
│   ├── css/style.css
│   ├── js/app.js         3-step form, validation, result rendering
│   ├── fonts/             Young Serif + Instrument Sans (self-hosted, no Google Fonts call)
│   └── img/               3 of your 4 uploaded images, converted to WebP
├── requirements.txt
└── Procfile              for gunicorn on Render/Railway/etc.
```

## Running it

```bash
cd heart-disease-app
pip install -r requirements.txt
python app.py              # http://127.0.0.1:5000, set PORT to change it
```

For production:

```bash
gunicorn app:app --preload --workers 2 --bind 0.0.0.0:8000
```

`--preload` matters here: it trains the model once in the master process
before forking workers, instead of once per worker.

## How a prediction is explained

There's no saved "importance" from the KNN model itself, so the result page
answers a more honest question instead: **for each answer on its own, how did
patients who gave that same answer turn out?** Categories match exactly
(`ChestPainType == 'ASY'`); numbers match within a window (e.g. cholesterol
±25 mg/dL). Groups smaller than 20 patients are skipped so the percentage
shown isn't noise. This is a plain dataset lookup, not a claim about what the
model itself weighted — described that way in the UI copy too.

## Image not included

The fourth uploaded image (the red glowing body silhouette) carries a
repeated "Unsplash+" watermark across the frame, so I left it out of a page
meant to be shared or deployed. If you have the licensed version, drop it in
`static/img/` and I can wire it into a new section.

## What I'd still change with more time

- Only tested in Chromium (desktop + one mobile viewport). Worth a pass on
  Safari/iOS specifically for the slider thumb styling.
- No automated tests — `app.py`'s `validate()` and `model_service.py` are
  small enough to unit test directly if this grows.
- The habits/model sections are static copy; could pull the accuracy numbers
  into the hero if you want the stats more up top.

## Model-selection notes (for your own reference)

Tried during cleanup, all cross-validated the same way:

| Model | Accuracy |
|---|---|
| KNN k=5 (original) | 85.5% |
| **KNN k=15 (used)** | **86.1%** |
| Logistic Regression | 85.6% |
| SVM (RBF) | 86.6% |
| Random Forest | 86.8% |

Random Forest and SVM edge out KNN slightly, but KNN keeps the "patients
like you" framing intuitive for a checker like this — swap the classifier in
`model_service.py`'s `_build_pipeline()` if you'd rather chase the extra ~1%.
