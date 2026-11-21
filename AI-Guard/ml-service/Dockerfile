# FROM python:3.11-slim
#
# ENV PYTHONDONTWRITEBYTECODE=1 \
#     PYTHONUNBUFFERED=1 \
#     POLICY_PATH=/app/policy.yaml \
#     MODEL_PATH=/app/models/guard_model.joblib \
#     BACKEND_URL=http://backend:8081 \
#     LLAMA_URL=http://llama:8080 \
#     LLM_ENABLED=false
#
# WORKDIR /app
#
# RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ \
#     && rm -rf /var/lib/apt/lists/*
#
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
#
# COPY app ./app
# COPY models ./models
# COPY policy.yaml ./policy.yaml
#
# EXPOSE 8000
#
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POLICY_PATH=/app/policy.yaml \
    MODEL_PATH=/app/models/guard_model.joblib \
    BACKEND_URL=http://backend:8000 \
    LLAMA_URL=http://llama:8080 \
    LLM_ENABLED=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY models ./models
COPY policy.yaml ./policy.yaml

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
