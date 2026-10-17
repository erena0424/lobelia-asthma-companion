"""Audit the flare classifier against simple baselines on AAMOS-00.

Usage (from asthma-app/):
    python scripts/audit_forecast_model.py <folder with anonym_aamos00_*.csv>

Reports pooled, within-person and new-flare AUC for the model and for
"tomorrow = today", plus what each Low/Medium/High level meant for people
the model never saw. Read-only: trains in memory, saves nothing.
"""
import sys, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, brier_score_loss

from model.feature_engineering import (
    CATEGORICAL_COLS, SENSOR_LAG_COLS, binary_valid_features, build_binary_daily_dataset,
    default_binary_feature_columns, encode_categorical_features,
)
from model.model import train_xgb_classifier
from model.train import chronological_user_split, prepare_modeling_frame

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else "model/data/raw")
files = ["dailyquestionnaire", "environment", "smartwatch1", "smartwatch2", "smartwatch3"]
dfs = {f: pd.read_csv(RAW / f"anonym_aamos00_{f}.csv") for f in files}
daily = build_binary_daily_dataset(dfs)
X_cols, y_col = default_binary_feature_columns()
feats = binary_valid_features(X_cols)
df = prepare_modeling_frame(daily, X_cols, y_col)
print(f"rows={len(df)} users={df.user_key.nunique()} flare_rate={df[y_col].mean():.3f}")
per_user_rate = df.groupby("user_key")[y_col].agg(["size", "mean"])
print("per-user flare rate:\n", per_user_rate.round(2).T.to_string())

train, test = chronological_user_split(df)
ENV = [c for c in feats if c not in SENSOR_LAG_COLS + ["is_flare_up", "temp_diff_tomorrow"]]


def fit_predict(tr, te, cols):
    Xtr = encode_categorical_features(tr, cols, [c for c in CATEGORICAL_COLS if c in cols])
    Xte = encode_categorical_features(te, cols, [c for c in CATEGORICAL_COLS if c in cols], reference_columns=Xtr.columns.tolist())
    m = train_xgb_classifier(Xtr, tr[y_col].astype(int))
    return m, m.predict_proba(Xte)[:, 1]


def within_user_auc(te, p):
    aucs = []
    for _, g in te.assign(p=p).groupby("user_key"):
        if g[y_col].nunique() > 1:
            aucs.append(roc_auc_score(g[y_col], g.p))
    return np.mean(aucs), len(aucs)


def onset_auc(te, p):
    """Days with no flare today: can we tell which ones flare tomorrow?"""
    g = te.assign(p=p)
    g = g[g.is_flare_up == 0]
    return roc_auc_score(g[y_col], g.p) if g[y_col].nunique() > 1 else float("nan"), int(g[y_col].sum()), len(g)


y = test[y_col].astype(int).values
rows = []
def report(name, p):
    wu, nwu = within_user_auc(test, p)
    oa, on, ot = onset_auc(test, p)
    rows.append(dict(model=name, pooled_auc=roc_auc_score(y, p), within_user_auc=wu, onset_auc=oa))

full_model, p_full = fit_predict(train, test, feats)
report("XGBoost, all features (as trained)", p_full)
report("Persistence: tomorrow = today", test.is_flare_up.values.astype(float))
user_rate = train.groupby("user_key")[y_col].mean()
p_rate = test.user_key.map(user_rate).fillna(train[y_col].mean()).values
report("Each person's past flare rate", p_rate)
report("Persistence + past rate", 0.7 * test.is_flare_up.values + 0.3 * p_rate)
_, p_env = fit_predict(train, test, ENV + ["temp_diff_tomorrow"])
report("XGBoost, weather/air/pollen only", p_env)
test_nowear = test.copy(); test_nowear[SENSOR_LAG_COLS] = np.nan
Xtr = encode_categorical_features(train, feats, CATEGORICAL_COLS)
Xte = encode_categorical_features(test_nowear, feats, CATEGORICAL_COLS, reference_columns=Xtr.columns.tolist())
p_nowear = full_model.predict_proba(Xte)[:, 1]
report("XGBoost, app conditions (no wearable)", p_nowear)
res = pd.DataFrame(rows)
print("\n=== Chronological hold-out (last 20% of each person) ===")
print(res.round(3).to_string(index=False))
oa, on, ot = onset_auc(test, p_full)
print(f"onset subset: {on} flares among {ot} no-flare-today days")

# Leave-one-user-out: every app user is a new person the model never saw.
lou_p, lou_y, lou_today = [], [], []
for u in df.user_key.unique():
    tr, te = df[df.user_key != u], df[df.user_key == u]
    if len(te) < 5:
        continue
    te2 = te.copy(); te2[SENSOR_LAG_COLS] = np.nan
    _, p = fit_predict(tr, te2, feats)
    lou_p += list(p); lou_y += list(te[y_col].astype(int)); lou_today += list(te.is_flare_up)
lou_p, lou_y, lou_today = map(np.array, (lou_p, lou_y, lou_today))
print("\n=== Leave-one-person-out, no wearable (closest to a new app user) ===")
print(f"model AUC={roc_auc_score(lou_y, lou_p):.3f}  persistence AUC={roc_auc_score(lou_y, lou_today):.3f}")
m0 = lou_today == 0
print(f"onset AUC (no flare today)={roc_auc_score(lou_y[m0], lou_p[m0]):.3f} on {m0.sum()} days, {lou_y[m0].sum()} flares")


def level(p):
    return np.where(p >= 0.70, "High", np.where(p >= 0.40, "Medium", "Low"))
lv = level(lou_p)
print("\nWhat each level meant (leave-one-person-out, no wearable):")
t = pd.DataFrame({"level": lv, "flare_tomorrow": lou_y, "flare_today": lou_today})
print(t.groupby("level").agg(days=("flare_tomorrow", "size"), flare_tomorrow_rate=("flare_tomorrow", "mean"), flare_today_rate=("flare_today", "mean")).round(3).to_string())
print(f"Brier={brier_score_loss(lou_y, lou_p):.3f}  mean predicted={lou_p.mean():.3f}  actual={lou_y.mean():.3f}")
print("missed flares that were Low:", int(((lv == "Low") & (lou_y == 1)).sum()), "of", int(lou_y.sum()))
print("missed ONSET flares (no flare today) labelled Low:", int(((lv == "Low") & (lou_y == 1) & (lou_today == 0)).sum()), "of", int((lou_y[m0]).sum()))

# Importance and deployed artifact parity
imp = pd.Series(full_model.feature_importances_, index=Xtr.columns).sort_values(ascending=False)
print("\nTop importances:\n", imp.head(8).round(3).to_string())
bundle = joblib.load(Path(__file__).resolve().parents[1] / "model" / "artifacts" / "flare_classifier.joblib")
print("\nDeployed artifact keys:", list(bundle.keys()) if isinstance(bundle, dict) else type(bundle))
dm = bundle["model"]; dcols = bundle["feature_columns"]
Xall = encode_categorical_features(df.assign(**{c: np.nan for c in SENSOR_LAG_COLS}), feats, CATEGORICAL_COLS, reference_columns=dcols)
pd_ = dm.predict_proba(Xall)[:, 1]
print("deployed model (in-sample, no wearable): levels by today's flare status")
print(pd.crosstab(df.is_flare_up, level(pd_)).to_string())
dimp = pd.Series(dm.feature_importances_, index=dcols).sort_values(ascending=False)
print("deployed top importances:\n", dimp.head(6).round(3).to_string())
