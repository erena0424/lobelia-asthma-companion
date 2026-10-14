"""Feature engineering utilities extracted from the notebooks.

Functions expect a dict of DataFrames `dfs` with keys matching the notebooks
(e.g. 'peakflow', 'dailyquestionnaire', 'environment', 'smartwatch1', ...).

The main entrypoints are:
- `build_binary_daily_dataset(dfs)` for flare-up classification (primary; no PEF by default)
- `build_daily_dataset(dfs)` for legacy symptom-score regression

Production flare classification: **strategy 2** (keep feature NaNs; XGBoost learns
missing branches). Do not merge peak flow unless running notebook experiments.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Dict, List, Tuple

# pandas is imported inside the functions that use it so the API can import
# lightweight helpers (e.g. compute_is_flare_up) without loading pandas at startup.
if TYPE_CHECKING:
    import pandas as pd

POLLEN_COLS = ["grass_pollen", "tree_pollen", "weed_pollen"]
CATEGORICAL_COLS = POLLEN_COLS.copy()
SENSOR_LAG_COLS = [
    "sleep_minutes_lag",
    "sedentary_minutes_lag",
    "running_minutes_lag",
    "total_steps_lag",
    "avg_hr_lag",
]
INHALER_MAPPING = {0: 0, 1: 1.5, 3: 3.5, 5: 6.5, 9: 10.5, 12: 12}


def cast_pollen_categories(df: pd.DataFrame) -> pd.DataFrame:
    """Cast pollen level columns to pandas category for XGBoost."""
    out = df.copy()
    for col in POLLEN_COLS:
        if col in out.columns:
            out[col] = out[col].astype("category")
    return out


def clean_environment_df(env: pd.DataFrame) -> pd.DataFrame:
    """Deduplicate environment rows and cast pollen columns."""
    env = env.drop_duplicates(subset=["user_key", "date"]).copy()
    return cast_pollen_categories(env)


def clean_peakflow_df(peakflow: pd.DataFrame) -> pd.DataFrame:
    """Average multiple intraday peak-flow readings to one row per user/day."""
    return peakflow.groupby(["user_key", "date"])["pef_max"].mean().reset_index()


def clean_dailyquestionnaire_df(dailyquestionnaire: pd.DataFrame) -> pd.DataFrame:
    """Deduplicate questionnaire rows to one row per user/day."""
    return dailyquestionnaire.drop_duplicates(subset=["user_key", "date"]).copy()


def compute_activity_day_summary(dfs: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Concatenate smartwatch tables and compute daily activity summary.

    Expects keys 'smartwatch1','smartwatch2','smartwatch3' in `dfs`.
    Returns a DataFrame indexed by ['user_key','date'] with daily features.
    """
    import pandas as pd

    sw_keys = [k for k in ("smartwatch1", "smartwatch2", "smartwatch3") if k in dfs]
    if not sw_keys:
        return pd.DataFrame()

    smartwatch = pd.concat([dfs[k] for k in sw_keys], ignore_index=True)

    smartwatch = smartwatch.copy()
    smartwatch["is_running"] = smartwatch["activity_type"].isin([66, 98, 82])
    smartwatch["is_sleep"] = smartwatch["activity_type"].isin([106, 112, 121, 122, 123])
    smartwatch["is_sedentary"] = smartwatch["activity_type"].isin([80, 89, 90, 91, 92, 96])

    agg = (
        smartwatch.groupby(["user_key", "date"])
        .agg(
            running_minutes=("is_running", "sum"),
            sleep_minutes=("is_sleep", "sum"),
            sedentary_minutes=("is_sedentary", "sum"),
            total_steps=("steps", "sum"),
            avg_hr=("hr", "mean"),
        )
        .reset_index()
    )

    return agg


def baseline_per_user_pef(daily: pd.DataFrame, pef_col: str = "pef_max") -> pd.Series:
    """Compute baseline PEF per user as the mean of the top 10% of values (min 1)."""
    def baseline(x: pd.Series) -> float:
        return x.nlargest(max(1, int(len(x) * 0.1))).mean()

    baseline_values = daily.groupby("user_key")[pef_col].apply(baseline)
    baseline_values.name = "baseline_per_user"
    return baseline_values


def add_pef_features(daily: pd.DataFrame) -> pd.DataFrame:
    """Add baseline PEF and lagged PEF-derived columns."""
    import pandas as pd

    if "pef_max" not in daily.columns:
        return daily

    daily = daily.copy()
    baseline_vals = baseline_per_user_pef(daily, pef_col="pef_max").reset_index()
    baseline_vals.columns = ["user_key", "baseline_per_user"]
    daily = pd.merge(daily, baseline_vals, on="user_key", how="left")
    daily["pef_pct_best"] = daily["pef_max"] / daily["baseline_per_user"]
    daily["pef_pct_best_lag1"] = daily.groupby("user_key")["pef_pct_best"].shift(1)
    daily["pef_change"] = daily["pef_pct_best"] - daily["pef_pct_best_lag1"]
    return daily


def add_activity_lags(daily: pd.DataFrame) -> pd.DataFrame:
    """Add lagged smartwatch activity features."""
    daily = daily.copy()
    daily["sedentary_minutes_lag"] = daily.groupby("user_key")["sedentary_minutes"].shift(1)
    daily["running_minutes_lag"] = daily.groupby("user_key")["running_minutes"].shift(1)
    daily["total_steps_lag"] = daily.groupby("user_key")["total_steps"].shift(1)
    daily["avg_hr_lag"] = daily.groupby("user_key")["avg_hr"].shift(1)
    return daily


def build_daily_dataset(dfs: Dict[str, pd.DataFrame], merge_activity: bool = True) -> pd.DataFrame:
    """Build the regression `daily` dataset used by Asthma_Prediction_Model."""
    import pandas as pd

    if "dailyquestionnaire" not in dfs:
        raise KeyError("dfs must contain 'dailyquestionnaire'")

    daily = clean_dailyquestionnaire_df(dfs["dailyquestionnaire"])

    daily.loc[daily["daily_limit_activity"].isna(), "daily_limit_activity"] = False
    daily["symptom_score"] = (
        daily["daily_night_symp"].astype(int)
        + daily["daily_day_symp"].astype(int)
        + daily["daily_limit_activity"].astype(int)
        + daily["daily_prev_inhaler"].fillna(0).astype(int)
        + daily["daily_relief_inhaler"].fillna(0).astype(int)
    )

    daily = daily.sort_values(["user_key", "date"])
    daily["symptom_score_lag1"] = daily.groupby("user_key")["symptom_score"].shift(1)
    daily["target"] = daily.groupby("user_key")["symptom_score"].shift(-1)

    if "environment" in dfs:
        env_clean = clean_environment_df(dfs["environment"])
        daily = pd.merge(daily, env_clean, on=["user_key", "date"], how="inner")

    if "peakflow" in dfs:
        peakflow_clean = clean_peakflow_df(dfs["peakflow"])
        daily = pd.merge(daily, peakflow_clean, on=["user_key", "date"], how="left")

    daily = add_pef_features(daily)

    if merge_activity:
        activity_summary = compute_activity_day_summary(dfs)
        if not activity_summary.empty:
            daily = pd.merge(daily, activity_summary, on=["user_key", "date"], how="left")
            daily = add_activity_lags(daily)

    return cast_pollen_categories(daily)


def compute_is_flare_up(
    relief_inhaler: float | int | None,
    daily_day_symp: bool | int | None = None,
    daily_night_symp: bool | int | None = None,
    daily_limit_activity: bool | int | None = None,
) -> int | None:
    """Derive today's flare-up from questionnaire fields (matches Asthma_binary.ipynb)."""
    if relief_inhaler is None and any(
        v is None for v in (daily_day_symp, daily_night_symp, daily_limit_activity)
    ):
        return None
    puffs = INHALER_MAPPING.get(int(relief_inhaler or 0), float(relief_inhaler or 0))
    symptomatic = bool(daily_day_symp) and bool(daily_night_symp) and bool(daily_limit_activity)
    return int((puffs >= 3) or symptomatic)


def build_binary_daily_dataset(
    dfs: Dict[str, pd.DataFrame],
    add_temp_diff: bool = True,
    merge_peakflow: bool = False,
) -> pd.DataFrame:
    """Build the leak-free flare-up classification dataset from Asthma_binary.

    Peak flow is optional: the classifier does not use PEF values. Set
    ``merge_peakflow=True`` only for experiments with ``peakflow_connected``.
    """
    import pandas as pd

    if "dailyquestionnaire" not in dfs:
        raise KeyError("dfs must contain 'dailyquestionnaire'")

    daily = clean_dailyquestionnaire_df(dfs["dailyquestionnaire"])
    daily["actual_puffs"] = daily["daily_relief_inhaler"].map(INHALER_MAPPING)
    daily["is_flare_up"] = (
        (daily["actual_puffs"] >= 3)
        | (daily["daily_day_symp"] & daily["daily_limit_activity"] & daily["daily_night_symp"])
    ).astype(int)

    if "environment" in dfs:
        env_clean = clean_environment_df(dfs["environment"])
        daily = pd.merge(daily, env_clean, on=["user_key", "date"], how="inner")

    if merge_peakflow and "peakflow" in dfs:
        peakflow_clean = clean_peakflow_df(dfs["peakflow"])
        daily = pd.merge(daily, peakflow_clean, on=["user_key", "date"], how="left")
        daily = add_pef_features(daily)

    activity_summary = compute_activity_day_summary(dfs)
    if not activity_summary.empty:
        daily = pd.merge(daily, activity_summary, on=["user_key", "date"], how="left")

    daily = daily.sort_values(["user_key", "date"]).reset_index(drop=True)
    daily["tomorrow_flare_up"] = daily.groupby("user_key")["is_flare_up"].shift(-1)
    daily["sleep_minutes_lag"] = daily.groupby("user_key")["sleep_minutes"].shift(1)
    daily = add_activity_lags(daily)

    if add_temp_diff:
        daily["temp_diff_tomorrow"] = (
            daily.groupby("user_key")["temperature"].shift(-1) - daily["temperature"]
        )

    return cast_pollen_categories(daily)


def default_feature_columns() -> Tuple[List[str], str]:
    """Default regression feature columns and target."""
    X_cols = [
        "temperature", "temperature_min", "temperature_max",
        "pressure", "humidity", "wind_speed", "wind_deg", "aqi", "co", "no",
        "no2", "o3", "so2", "pm2_5", "pm10", "nh3", "grass_pollen",
        "tree_pollen", "weed_pollen", "sleep_minutes", "sedentary_minutes_lag",
        "running_minutes_lag", "total_steps_lag", "avg_hr_lag", "pef_pct_best_lag1",
        "pef_change", "symptom_score_lag1",
    ]
    y_col = "target"
    return X_cols, y_col


def default_binary_feature_columns(include_temp_diff: bool = True) -> Tuple[List[str], str]:
    """Default classification feature columns and target."""
    X_cols = [
        "temperature", "temperature_min", "temperature_max", "pressure", "humidity",
        "wind_speed", "wind_deg", "aqi", "co", "no", "no2", "o3", "so2", "pm2_5",
        "pm10", "nh3", "grass_pollen", "tree_pollen", "weed_pollen",
        "sleep_minutes_lag", "sedentary_minutes_lag", "running_minutes_lag",
        "total_steps_lag", "avg_hr_lag", "is_flare_up",
    ]
    if include_temp_diff:
        X_cols.append("temp_diff_tomorrow")
    return X_cols, "tomorrow_flare_up"


def binary_valid_features(X_cols: List[str]) -> List[str]:
    """Return leak-free predictors for tomorrow's flare-up classification."""
    excluded = {
        "actual_puffs",
        "daily_night_symp",
        "daily_day_symp",
        "daily_limit_activity",
        "is_flare_up",
    }
    return [c for c in X_cols if c not in excluded] + ["is_flare_up"]


def encode_categorical_features(
    df: pd.DataFrame,
    feature_cols: List[str],
    categorical_cols: List[str] | None = None,
    reference_columns: List[str] | None = None,
) -> pd.DataFrame:
    """One-hot encode pollen columns, optionally aligning to reference columns."""
    import pandas as pd

    categorical_cols = categorical_cols or CATEGORICAL_COLS
    encoded = pd.get_dummies(df[feature_cols], columns=categorical_cols, drop_first=True)
    if reference_columns is not None:
        encoded = encoded.reindex(columns=reference_columns, fill_value=0)
    return encoded
