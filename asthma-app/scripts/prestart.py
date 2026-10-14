"""Container pre-start: wait for PostgreSQL, then apply Alembic migrations.

Same steps as running `python scripts/wait_for_db.py && alembic upgrade head`, but in a
single Python process, so a cold start pays for one interpreter + SQLAlchemy import
instead of two.

Set RUN_MIGRATIONS_ON_START=0 to skip the migration step (e.g. once migrations are run
as a separate deploy step). Default is on, matching the previous entrypoint.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_DIR))

from scripts.wait_for_db import main as wait_for_db  # noqa: E402


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(APP_DIR / "alembic.ini")), "head")


def main() -> None:
    wait_for_db()
    if os.getenv("RUN_MIGRATIONS_ON_START", "1").strip().lower() in ("0", "false", "no"):
        print("RUN_MIGRATIONS_ON_START is off; skipping alembic upgrade.")
        return
    run_migrations()


if __name__ == "__main__":
    main()
