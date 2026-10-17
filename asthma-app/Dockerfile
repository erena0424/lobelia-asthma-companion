# Mirror Lake API — uses free Docker Engine / Compose (no Docker Desktop subscription required).
FROM python:3.12-slim-bookworm

WORKDIR /app

# libgomp1: XGBoost runtime on slim images
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

RUN chmod +x /app/scripts/docker-entrypoint.sh

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
# Cloud Run sets $PORT (8080 by default); locally and in Compose it falls back to 8000
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app"]
