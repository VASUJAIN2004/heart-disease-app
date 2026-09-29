"""Flask backend for the heart disease risk checker.

    python app.py            # development server on http://127.0.0.1:5000
    gunicorn app:app         # production
"""
from __future__ import annotations

import os

from flask import Flask, jsonify, render_template, request

from model_service import get_model

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024  # answers are tiny; reject anything larger

model = get_model()  # trains once at start-up (about a second)

# One entry per question: how to validate the answer sent by the browser.
SCHEMA = {
    "Age": {"type": int, "min": 18, "max": 100, "label": "Age"},
    "Sex": {"choices": {"M", "F"}, "label": "Sex"},
    "ChestPainType": {"choices": {"TA", "ATA", "NAP", "ASY"}, "label": "Chest pain type"},
    "RestingBP": {"type": int, "min": 70, "max": 250, "label": "Resting blood pressure"},
    "Cholesterol": {"type": int, "min": 80, "max": 700, "optional": True, "label": "Cholesterol"},
    "FastingBS": {"choices": {0, 1}, "type": int, "label": "Fasting blood sugar"},
    "RestingECG": {"choices": {"Normal", "ST", "LVH"}, "label": "Resting ECG"},
    "MaxHR": {"type": int, "min": 60, "max": 220, "label": "Maximum heart rate"},
    "ExerciseAngina": {"choices": {"Y", "N"}, "label": "Exercise angina"},
    "Oldpeak": {"type": float, "min": -3.0, "max": 8.0, "label": "ST depression"},
    "ST_Slope": {"choices": {"Up", "Flat", "Down"}, "label": "ST slope"},
}


def validate(payload) -> tuple[dict, dict]:
    """Return (clean_answers, errors). `errors` maps a field name to a message."""
    if not isinstance(payload, dict):
        return {}, {"_": "Send the answers as a JSON object."}

    clean, errors = {}, {}
    for field, rule in SCHEMA.items():
        value = payload.get(field)

        if value is None or value == "":
            if rule.get("optional"):
                clean[field] = None
            else:
                errors[field] = f"{rule['label']} is required."
            continue

        if "type" in rule:
            if isinstance(value, bool):
                errors[field] = f"{rule['label']} must be a number."
                continue
            try:
                value = rule["type"](value)
            except (TypeError, ValueError):
                errors[field] = f"{rule['label']} must be a number."
                continue

        if "choices" in rule and value not in rule["choices"]:
            errors[field] = f"Choose one of the listed options for {rule['label'].lower()}."
            continue

        if "min" in rule and not (rule["min"] <= value <= rule["max"]):
            errors[field] = (
                f"{rule['label']} should be between {rule['min']} and {rule['max']}."
            )
            continue

        clean[field] = value
    return clean, errors


@app.get("/")
def index():
    return render_template("index.html", info=model.info, metrics=model.metrics)


@app.post("/api/predict")
def predict():
    answers, errors = validate(request.get_json(silent=True))
    if errors:
        return jsonify({"errors": errors}), 400
    return jsonify(model.predict(answers))


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


@app.after_request
def add_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", 5000)))
