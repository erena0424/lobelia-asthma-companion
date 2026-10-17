"""Do short-history features let a model see new flares coming? (AAMOS-00, leave-one-person-out)"""
import sys, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import roc_auc_score

from model.feature_engineering import build_binary_daily_dataset

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else "model/data/raw")
files = ["dailyquestionnaire", "environment", "smartwatch1", "smartwatch2", "smartwatch3"]
dfs = {f: pd.read_csv(RAW / f"anonym_aamos00_{f}.csv") for f in files}
d = build_binary_daily_dataset(dfs).dropna(subset=["tomorrow_flare_up"]).copy()
d = d.drop_duplicates(["user_key", "date"]).sort_values(["user_key", "date"]).reset_index(drop=True)
# Only use the next row as "tomorrow" when it really is the next day.
nxt = d.groupby("user_key")["date"].shift(-1)
d = d[(nxt - d["date"]) == 1].copy()

g = d.groupby("user_key")
for c in ["daily_day_symp", "daily_night_symp", "daily_limit_activity"]:
    d[c] = d[c].astype(float)
d["symptom_count"] = d[["daily_day_symp", "daily_night_symp", "daily_limit_activity"]].sum(axis=1)
roll = lambda col, n: g[col].transform(lambda s: s.rolling(n, min_periods=1).mean())
d["flare_3d"] = roll("is_flare_up", 3)
d["flare_7d"] = roll("is_flare_up", 7)
d["symptoms_3d"] = roll("symptom_count", 3)
d["puffs_3d"] = roll("actual_puffs", 3)
d["puffs_7d"] = roll("actual_puffs", 7)
d["puffs_rise"] = d["actual_puffs"] - g["actual_puffs"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
d["personal_rate_so_far"] = g["is_flare_up"].transform(lambda s: s.expanding().mean())
d["days_logged"] = g.cumcount() + 1
last_flare = d["date"].where(d["is_flare_up"] == 1)
d["days_since_flare"] = (d["date"] - last_flare.groupby(d["user_key"]).ffill()).clip(upper=30)
for c in ["temperature", "pressure", "humidity", "pm2_5", "o3", "no2"]:
    d[f"{c}_change"] = d[c] - g[c].shift(1)
pollen_rank = {"Low": 0, "Moderate": 1, "High": 2, "Very High": 3}
for c in ["grass_pollen", "tree_pollen", "weed_pollen"]:
    d[c + "_n"] = d[c].astype(str).map(pollen_rank)

BASE = ["is_flare_up"]
TODAY = BASE + ["daily_day_symp", "daily_night_symp", "daily_limit_activity", "actual_puffs"]
HIST = TODAY + ["flare_3d", "flare_7d", "symptoms_3d", "puffs_3d", "puffs_7d", "puffs_rise", "days_since_flare"]
PERSONAL = HIST + ["personal_rate_so_far", "days_logged"]
WEATHER = ["temperature", "humidity", "pressure", "aqi", "pm2_5", "o3", "no2",
           "grass_pollen_n", "tree_pollen_n", "weed_pollen_n", "temp_diff_tomorrow",
           "temperature_change", "pressure_change", "humidity_change", "pm2_5_change", "o3_change", "no2_change"]
SETS = {
    "Current model inputs (today flare + weather)": BASE + WEATHER,
    "Today's check-in in detail": TODAY,
    "+ 3/7-day history": HIST,
    "+ 3/7-day history + weather changes": HIST + WEATHER,
    "+ history + own past flare rate": PERSONAL,
    "+ history + own rate + weather": PERSONAL + WEATHER,
}
y_col = "tomorrow_flare_up"
users = [u for u, n in d.groupby("user_key").size().items() if n >= 5]
d = d[d.user_key.isin(users)]


def lopo(cols, kind):
    out = pd.Series(np.nan, index=d.index)
    for u in users:
        tr, te = d[d.user_key != u], d[d.user_key == u]
        y = tr[y_col].astype(int)
        if kind == "xgb":
            m = xgb.XGBClassifier(n_estimators=150, max_depth=3, learning_rate=0.05, subsample=0.8,
                                  colsample_bytree=0.8, eval_metric="logloss", random_state=0)
        else:
            m = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=2000, C=0.5))
        m.fit(tr[cols].astype(float), y)
        out[te.index] = m.predict_proba(te[cols].astype(float))[:, 1]
    return out


def scores(p):
    y = d[y_col].astype(int)
    onset = d.is_flare_up == 0
    ended = d.is_flare_up == 1
    within = []
    for _, gg in d.assign(p=p).groupby("user_key"):
        if gg[y_col].nunique() > 1 and len(gg) >= 20:
            within.append(roc_auc_score(gg[y_col], gg.p))
    return dict(
        all_days=roc_auc_score(y, p),
        new_flares=roc_auc_score(y[onset], p[onset]),
        flare_ending=roc_auc_score(y[ended], p[ended]),
        within_person=np.mean(within),
    )


rows = [dict(features='"Tomorrow = today"', model="rule", **scores(d.is_flare_up.astype(float)))]
for name, cols in SETS.items():
    for kind in ["xgb", "logit"]:
        rows.append(dict(features=name, model=kind, **scores(lopo(cols, kind))))
res = pd.DataFrame(rows)
print(f"days={len(d)} people={len(users)} new-flare days={int(((d.is_flare_up==0)&(d[y_col]==1)).sum())} of {int((d.is_flare_up==0).sum())}")
print(res.round(3).to_string(index=False))

# Best set: what would the levels mean, and how many new flares would get flagged?
best = lopo(PERSONAL + WEATHER, "logit")
onset = (d.is_flare_up == 0).values
y = d[y_col].astype(int).values
for thr in [0.15, 0.2, 0.25, 0.3]:
    flag = (best.values >= thr) & onset
    caught = int((flag & (y == 1)).sum()); total = int((onset & (y == 1)).sum())
    print(f"threshold {thr}: flags {flag.sum()} of {onset.sum()} no-flare days, catches {caught}/{total} new flares, "
          f"precision {caught / max(flag.sum(), 1):.2f}")
