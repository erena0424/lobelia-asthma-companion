#!/usr/bin/env sh
set -eu

cd /app

# Wait for the database and run `alembic upgrade head` in one Python process
# (was two separate processes; this shortens cold starts).
python scripts/prestart.py

exec "$@"
