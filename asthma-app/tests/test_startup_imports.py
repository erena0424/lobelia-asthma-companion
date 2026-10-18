"""Guard Cloud Run cold-start time: importing the API must not load heavy libraries.

pandas/numpy/xgboost/sklearn (classifier), anthropic and langgraph (advice workflow) are
imported lazily by the routes that use them and warmed in a background thread after boot.
A new top-level import of one of them adds seconds to every cold start.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

HEAVY_MODULES = ["pandas", "numpy", "xgboost", "sklearn", "scipy", "joblib", "anthropic", "langgraph"]


def test_importing_api_does_not_load_heavy_libraries():
    app_dir = Path(__file__).resolve().parent.parent
    code = (
        "import json, sys; import api.main; "
        f"print(json.dumps([m for m in {HEAVY_MODULES!r} if m in sys.modules]))"
    )
    env = {**os.environ, "JWT_SECRET": os.environ.get("JWT_SECRET", "test-secret-startup-imports")}
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=app_dir, env=env, capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr
    loaded = json.loads(result.stdout.strip().splitlines()[-1])
    assert loaded == [], f"Loaded at API import (slows cold starts; import inside the function): {loaded}"
