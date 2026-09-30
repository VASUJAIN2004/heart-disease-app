# ❤️ Heartline: Heart Disease Risk Checker

A Flask web app that estimates heart disease risk from a few check-up answers, with a custom-designed HTML/CSS/JS front end and a validated machine learning pipeline.

**🔗 Live demo:** https://heart-disease-app-lemon.vercel.app

> ⚠️ **Disclaimer:** Heartline is an educational project. It is not a medical device and does not provide a medical diagnosis. Please consult a qualified doctor for any health concern.

---

## Highlights

- **End-to-end ML project:** data cleaning, model selection, deployment and a custom user interface.
- **Found and fixed a pipeline bug** in the original Streamlit version (see below).
- **Cross-validated performance:** ~86% accuracy, 90% sensitivity, 80% specificity.
- **Explainable results:** each answer is compared with how similar patients in the dataset turned out.
- **Live metrics:** the numbers shown on the page are computed at startup, so they always match the code.

## Tech Stack

| Layer | Tools |
|---|---|
| Backend | Python, Flask |
| Machine Learning | Scikit-learn (KNN, StandardScaler, OneHotEncoder, ColumnTransformer), Pandas, NumPy |
| Frontend | HTML, CSS, JavaScript (3-step form, validation, result rendering) |
| Deployment | Vercel (live), Gunicorn `Procfile` included |

## The Story: What Changed From the Streamlit Version

The first version of this project was a Streamlit app. While testing it I found that the saved `KNN_heart.pkl` and `scaler.pkl` were broken: the scaler had been fit on data that was **already scaled**, so the app fed raw values (for example, cholesterol 200) into a model that expected numbers like -0.05.

Testing that exact pipeline against `heart.csv` showed:

- **66% accuracy**
- **79% of patients flagged as high-risk**, against a true rate of 55%

The rebuild fixes this. `model_service.py` retrains a clean pipeline from `data/heart.csv` every time the server starts (about one second):

- Missing cholesterol and blood pressure values (stored as `0` in this dataset) are **imputed with the median** instead of being trained on as real zeros.
- A single `ColumnTransformer` with `StandardScaler` and `OneHotEncoder` ensures training and prediction always use the same transformation.
- `KNeighborsClassifier(n_neighbors=15)` was chosen by cross-validated accuracy across k = 5 to 25 and several other model types.

## Model Performance

5-fold cross-validation, repeated 3 times, on 918 patient records:

| Metric | Result |
|---|---|
| Accuracy | ~86% |
| Sensitivity (recall) | 90% |
| Specificity | 80% |

### Model comparison

| Model | Accuracy |
|---|---|
| KNN, k=5 (original) | 85.5% |
| **KNN, k=15 (used)** | **86.1%** |
| Logistic Regression | 85.6% |
| SVM (RBF) | 86.6% |
| Random Forest | 86.8% |

Random Forest and SVM score about 1% higher, but KNN was kept for two reasons: sensitivity matters most for a risk screener, and KNN supports an intuitive "patients like you" explanation. The classifier can be swapped in `_build_pipeline()` inside `model_service.py`.

## How a Prediction Is Explained

KNN has no built-in feature importance, so the result page answers a more honest question: for each answer on its own, **how did patients who gave the same answer turn out?**

- Categories match exactly (for example, `ChestPainType == 'ASY'`).
- Numbers match within a window (for example, cholesterol ±25 mg/dL).
- Groups smaller than 20 patients are skipped so the percentage is not noise.

This is a plain dataset lookup, not a claim about what the model weighted internally, and the UI describes it that way.

## Project Structure

```
heart-disease-app/
├── app.py                Flask routes and input validation
├── model_service.py      Data cleaning, training, prediction, explanations
├── data/heart.csv        Training data (918 rows)
├── templates/index.html
├── static/
│   ├── css/style.css
│   ├── js/app.js         3-step form, validation, result rendering
│   ├── fonts/            Young Serif + Instrument Sans (self-hosted)
│   └── img/              Optimised WebP images
├── requirements.txt
└── Procfile              For Gunicorn-based hosts
```

## Run Locally

```bash
git clone https://github.com/VASUJAIN2004/heart-disease-app.git
cd heart-disease-app
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000 (set the `PORT` environment variable to change the port).

For production with Gunicorn:

```bash
gunicorn app:app --preload --workers 2 --bind 0.0.0.0:8000
```

`--preload` trains the model once in the master process before forking workers, instead of once per worker.

## Known Limitations and Next Steps

- Tested in Chromium (desktop and one mobile viewport); Safari/iOS needs a check, especially the slider thumb styling.
- No automated tests yet. `validate()` in `app.py` and the functions in `model_service.py` are small enough to unit test directly.
- Trained on a single 918-row dataset, so results should not be generalised beyond it.

## Author

**Vasu Jain**: B.Tech CSE (AI/ML)

[GitHub](https://github.com/VASUJAIN2004) · [LinkedIn](https://linkedin.com/in/vasu-jain-539a772b6) · vasujain123vasu@gmail.com
