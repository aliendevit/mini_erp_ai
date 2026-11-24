FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client fonts-dejavu-core \
    && pip install -r requirements.txt \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./alembic.ini

RUN addgroup --system omran \
    && adduser --system --ingroup omran omran \
    && mkdir -p /app/uploads /app/backups /app/logs \
    && chown -R omran:omran /app

USER omran

EXPOSE 3001

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 3001 --proxy-headers"]
