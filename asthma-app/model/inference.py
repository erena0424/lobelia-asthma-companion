"""Inference: flare classifier (when available) and GINA cold-start fallbacks."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

# numpy / pandas / joblib / xgboost / sklearn are imported inside the functions that
# use them, so importing this module (and booting the API) stays fast on cold starts.
from model.feature_engineering import SENSOR_LAG_COLS, compute_is_flare_up  # noqa: F401
from model.risk_engine import compute_app_risk, compute_risk

if TYPE_CHECKING:
    import pandas as pd

MODEL_DIR = Path(__file__).resolve().parent
CLASSIFIER_ARTIFACT = MODEL_DIR / "artifacts" / "flare_classifier.joblib"
SAVED_MODELS = MODEL_DIR.parent / "saved_models"
ELENA_MODEL_PATH = SAVED_MODELS / "elena_global_model.joblib"
ELENA_FEATURES_PATH = SAVED_MODELS / "feature_columns.json"

RISK_LEVEL_THRESHOLDS = {"High": 0.70, "Medium": 0.40}

OPTIONAL_CLASSIFIER_FEATURES = set(SENSOR_LAG_COLS) | {"temp_diff_tomorrow", "is_flare_up"}

_classifier_bundle: dict | None = None
_elena_model = None
_elena_feature_columns: list[str] | None = None


def classifier_model_available() -> bool:
    """True when the trained flare classifier artifact is on disk."""
    return CLASSIFIER_ARTIFACT.exists()


def elena_model_available() -> bool:
    """True when legacy saved_models export exists (pre-artifacts workflow)."""
    return ELENA_MODEL_PATH.exists() and ELENA_FEATURES_PATH.exists()


def model_available() -> bool:
    """True when any production classifier can be loaded."""
    return classifier_model_available() or elena_model_available()


def _load_classifier_bundle() -> dict:
    global _classifier_bundle
    if _classifier_bundle is None:
        if not classifier_model_available():
            raise FileNotFoundError(
                f"Classifier not found at {CLASSIFIER_ARTIFACT}. "
                "Train with notebooks/moduler_workflow.ipynb or Asthma_binary.ipynb."
            )
        from model.inference_new import load_model

        _classifier_bundle = load_model(str(CLASSIFIER_ARTIFACT))
        if not _classifier_bundle.get("feature_columns"):
            raise ValueError(
                f"{CLASSIFIER_ARTIFACT} is missing feature_columns. Retrain and save with save_model()."
            )
    return _classifier_bundle


def _load_elena_artifacts() -> tuple[object, list[str]]:
    global _elena_model, _elena_feature_columns
    if _elena_model is None or _elena_feature_columns is None:
        if not elena_model_available():
            raise FileNotFoundError(
                f"Legacy Elena model not found. Expected:\n"
                f"  {ELENA_MODEL_PATH}\n"
                f"  {ELENA_FEATURES_PATH}\n"
                "Or train the classifier into model/artifacts/flare_classifier.joblib."
            )
        import joblib

        _elena_model = joblib.load(ELENA_MODEL_PATH)
        with open(ELENA_FEATURES_PATH) as f:
            _elena_feature_columns = json.load(f)
    return _elena_model, _elena_feature_columns


def _probability_to_risk_level(probability: float) -> str:
    if probability >= RISK_LEVEL_THRESHOLDS["High"]:
        return "High"
    if probability >= RISK_LEVEL_THRESHOLDS["Medium"]:
        return "Medium"
    return "Low"


def _nan_to_none(value):
    """Make API JSON responses serializable (NaN → null)."""
    import numpy as np

    if isinstance(value, float) and np.isnan(value):
        return None
    return value


def normalize_classifier_features(features: dict) -> tuple[dict, list[str]]:
    """Convert API JSON nulls to NaN for XGBoost (strategy 2; never use 0 for unknown)."""
    import numpy as np

    normalized = {}
    missing = []
    for key, value in features.items():
        if value is None:
            normalized[key] = np.nan
            if key in OPTIONAL_CLASSIFIER_FEATURES:
                missing.append(key)
        else:
            normalized[key] = value
    return normalized, missing


def predict_classifier(features: dict) -> dict:
    """Run the global flare classifier on one raw feature row (strategy 2, no PEF)."""
    import numpy as np
    import pandas as pd

    from model.feature_engineering import (
        binary_valid_features,
        cast_pollen_categories,
        default_binary_feature_columns,
    )
    from model.inference_new import predict_dataframe
    from model.model import feature_importances_df

    bundle = _load_classifier_bundle()
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]
    X_cols, _ = default_binary_feature_columns()

    features, missing_features = normalize_classifier_features(features)
    valid_features = binary_valid_features(X_cols)
    for col in valid_features:
        if col not in features:
            features[col] = np.nan
            if col in OPTIONAL_CLASSIFIER_FEATURES and col not in missing_features:
                missing_features.append(col)
    row_df = cast_pollen_categories(pd.DataFrame([features]))
    preds = predict_dataframe(model, row_df, X_cols, feature_columns)
    probability = float(preds["flare_probability"].iloc[0])
    predicted = int(preds["predicted"].iloc[0])
    risk_level = _probability_to_risk_level(probability)

    importance = feature_importances_df(model, feature_columns)
    top_features = (
        importance.head(5)["feature"].tolist() if not importance.empty else []
    )

    warnings = []
    if "is_flare_up" in missing_features:
        warnings.append(
            "is_flare_up was not provided. The model rarely saw this feature missing during "
            "training, so the prediction may be unreliable. Prefer deriving it from today's "
            "symptoms/inhaler use, or use POST /predict (GINA) for cold-start users."
        )

    return {
        "prediction_mode": "classifier",
        "flare_probability": round(probability, 4),
        "predicted_flare_tomorrow": bool(predicted),
        "risk_level": risk_level,
        "top_features": top_features,
        "triggered_rules": [
            f"Classifier: P(flare tomorrow)={probability:.0%}",
            f"Threshold prediction: {'flare' if predicted else 'no flare'}",
        ],
        "cold_start": bool(missing_features),
        "missing_features": missing_features,
        "warnings": warnings,
        "inputs": {k: _nan_to_none(v) for k, v in features.items()},
    }


def predict_elena_ml(encoded_features: pd.DataFrame) -> dict:
    """
    Run a pre-encoded feature row through the legacy saved_models export.

    `encoded_features` must match columns from feature_columns.json (after get_dummies).
    """
    model, feature_columns = _load_elena_artifacts()
    aligned = encoded_features.reindex(columns=feature_columns, fill_value=0)
    probability = float(model.predict_proba(aligned)[0, 1])
    risk_level = _probability_to_risk_level(probability)

    return {
        "prediction_mode": "elena_ml",
        "flare_probability": round(probability, 4),
        "predicted_flare_tomorrow": probability >= 0.5,
        "risk_level": risk_level,
        "top_features": [],
        "triggered_rules": [f"Elena model: P(flare tomorrow)={probability:.0%}"],
        "cold_start": False,
        "inputs": aligned.iloc[0].to_dict(),
    }


def predict_app_gina_fallback(
    *,
    cough_today: int,
    inhaler_today: int,
    aqi: float,
    pollen_level: int,
    temp_change: float,
    sens_cold: float = 0.5,
    sens_pollen: float = 0.5,
) -> dict:
    """GINA-style rules for cold-start users without Elena's full feature history."""
    result = compute_app_risk(
        cough_today=cough_today,
        inhaler_today=inhaler_today,
        aqi=aqi,
        pollen_level=pollen_level,
        temp_change=temp_change,
        sens_cold=sens_cold,
        sens_pollen=sens_pollen,
    )
    result["prediction_mode"] = "gina_app"
    result["flare_probability"] = None
    result["top_features"] = result.get("triggered_rules", [])
    result["cold_start"] = True
    return result


def predict_gina_fallback(
    *,
    night_symp: bool,
    day_symp: bool,
    limit_activity: bool,
    relief_inhaler_puffs: int,
    pef_am: float,
    pef_personal_best: float,
    aqi: float,
    pollen: float,
    temp: float,
) -> dict:
    """Full GINA rules when legacy clinical fields are supplied."""
    result = compute_risk(
        night_symp=night_symp,
        day_symp=day_symp,
        limit_activity=limit_activity,
        relief_inhaler_puffs=relief_inhaler_puffs,
        pef_am=pef_am,
        pef_personal_best=pef_personal_best,
        aqi=aqi,
        pollen=pollen,
        temp=temp,
    )
    result["prediction_mode"] = "gina"
    result["flare_probability"] = None
    result["top_features"] = result.get("triggered_rules", [])
    result["cold_start"] = True
    return result
