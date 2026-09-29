"""Training and prediction for the heart disease risk checker.

The model is a K-Nearest-Neighbours classifier (same algorithm as the original
Streamlit project) wrapped in a single scikit-learn Pipeline, so the exact same
cleaning and scaling is applied while training and while predicting.

It trains from data/heart.csv every time the server starts (this takes about a
second), so there are no pickle files that can go out of sync with the installed
scikit-learn version.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import make_scorer, recall_score
from sklearn.model_selection import RepeatedStratifiedKFold, cross_validate
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_PATH = Path(__file__).parent / "data" / "heart.csv"

NUMERIC = ["Age", "RestingBP", "Cholesterol", "MaxHR", "Oldpeak", "FastingBS"]
CATEGORICAL = ["Sex", "ChestPainType", "RestingECG", "ExerciseAngina", "ST_Slope"]
FEATURES = NUMERIC + CATEGORICAL
TARGET = "HeartDisease"

N_NEIGHBORS = 15

# Result bands are defined on how many of the 15 nearest patients had heart disease.
LOW_MAX = 5          # 0-5 of 15   -> lower
BORDERLINE_MAX = 9   # 6-9 of 15   -> borderline, 10-15 -> higher

# "Patients who answered like you": how wide a window counts as the same number,
# and the smallest group that is still worth reporting.
WINDOWS = {"Age": 5, "RestingBP": 10, "Cholesterol": 25, "MaxHR": 10, "Oldpeak": 0.5}
MIN_GROUP = 20


def _load_clean_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    # In this dataset a value of 0 means "not recorded" for these two columns
    # (172 cholesterol rows and 1 blood-pressure row). Treat them as missing so
    # the pipeline fills them in instead of learning from a fake zero.
    for col in ("Cholesterol", "RestingBP"):
        df[col] = df[col].replace(0, np.nan)
    return df


def _build_pipeline() -> Pipeline:
    numeric = Pipeline(
        [("fill", SimpleImputer(strategy="median")), ("scale", StandardScaler())]
    )
    preprocess = ColumnTransformer(
        [
            ("num", numeric, NUMERIC),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ]
    )
    return Pipeline(
        [
            ("prep", preprocess),
            ("knn", KNeighborsClassifier(n_neighbors=N_NEIGHBORS)),
        ]
    )


class RiskModel:
    def __init__(self) -> None:
        df = _load_clean_data()
        X, y = df[FEATURES], df[TARGET]

        self.pipeline = _build_pipeline().fit(X, y)

        # Honest performance estimate: 5-fold cross-validation repeated 3 times.
        # Every score comes from patients the model had not seen while fitting.
        scores = cross_validate(
            _build_pipeline(),
            X,
            y,
            cv=RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42),
            scoring={
                "accuracy": "accuracy",
                "sensitivity": "recall",
                "specificity": make_scorer(recall_score, pos_label=0),
            },
        )
        self.metrics = {
            "accuracy": float(np.mean(scores["test_accuracy"])),
            "sensitivity": float(np.mean(scores["test_sensitivity"])),
            "specificity": float(np.mean(scores["test_specificity"])),
        }
        self.info = {
            "records": int(len(df)),
            "with_disease": int(y.sum()),
            "neighbors": N_NEIGHBORS,
            "features": len(FEATURES),
        }

        # Kept for the "patients who answered like you" comparison.
        self._data = df
        self.base_rate = float(y.mean())

        # Range of each numeric column, used to warn about unusual values.
        self.ranges = {c: (float(X[c].min()), float(X[c].max())) for c in NUMERIC[:5]}

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _frame(rows: list[dict]) -> pd.DataFrame:
        df = pd.DataFrame(rows, columns=FEATURES)
        df[NUMERIC] = df[NUMERIC].astype(float)  # None -> NaN
        return df

    def _proba(self, rows: list[dict]) -> np.ndarray:
        return self.pipeline.predict_proba(self._frame(rows))[:, 1]

    @staticmethod
    def _level(positives: int) -> str:
        if positives <= LOW_MAX:
            return "low"
        if positives <= BORDERLINE_MAX:
            return "borderline"
        return "high"

    def _similar_answers(self, row: dict) -> list[dict]:
        """For each question on its own: how did patients who answered like you turn out?

        This is a plain look-up in the dataset (not an explanation of the model):
        categories match exactly, numbers match within a small window.
        """
        df = self._data
        out = []
        for feature in FEATURES:
            value = row.get(feature)
            if value is None:
                continue
            if feature in NUMERIC and feature != "FastingBS":
                mask = (df[feature] - value).abs() <= WINDOWS[feature]
            else:
                mask = df[feature] == value
            n = int(mask.sum())
            if n < MIN_GROUP:
                continue
            rate = float(df.loc[mask, TARGET].mean())
            item = {"feature": feature, "rate": round(rate, 3), "n": n}
            if feature in WINDOWS:
                item["window"] = WINDOWS[feature]
            out.append(item)
        out.sort(key=lambda r: abs(r["rate"] - self.base_rate), reverse=True)
        return out[:6]

    # ---------------------------------------------------------------- public API
    def predict(self, answers: dict) -> dict:
        """`answers` holds the 11 validated inputs. Cholesterol may be None."""
        row = {f: answers.get(f) for f in FEATURES}

        p = float(self._proba([row])[0])
        positives = int(round(p * N_NEIGHBORS))
        similar = self._similar_answers(row)

        outside = [
            name
            for name, (low, high) in self.ranges.items()
            if row.get(name) is not None and not (low <= row[name] <= high)
        ]

        return {
            "probability": round(p, 3),
            "neighbors_total": N_NEIGHBORS,
            "neighbors_positive": positives,
            "level": self._level(positives),
            "similar_answers": similar,
            "base_rate": round(self.base_rate, 3),
            "outside_range": outside,
        }


_model: RiskModel | None = None


def get_model() -> RiskModel:
    global _model
    if _model is None:
        _model = RiskModel()
    return _model


if __name__ == "__main__":
    m = get_model()
    print("Records:", m.info["records"])
    for name, value in m.metrics.items():
        print(f"{name:12s} {value:.3f}")
