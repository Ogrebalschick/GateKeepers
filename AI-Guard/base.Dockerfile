FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc default-libmysqlclient-dev pkg-config curl \
    && rm -rf /var/lib/apt/lists/*

# --- ОБЩИЕ Python-зависимости (если есть общие пакеты) ---
# Например, если у всех сервисов есть pandas, numpy, pydantic — ставим их здесь
RUN pip install --no-cache-dir \
        pydantic \
        pydantic-settings \
        python-jose[cryptography,rsa] \
        passlib[bcrypt] \
        bcrypt \
        psycopg2-binary \
        aiofiles
