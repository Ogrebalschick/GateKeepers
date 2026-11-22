# FROM base
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MODEL_PATH=/app/llama.cpp/ggml-model-q4_0.gguf \
    GPU_COUNT=1 \
    LLAMA_CPP_PATH=/app/llama.cpp

WORKDIR /app

EXPOSE 8080

CMD ["/app/llama.cpp/llama-server", "--host", "0.0.0.0", "--port", "8080", "--model", "/app/llama.cpp/ggml-model-q4_0.gguf", "--n-gpu-layers", "1"]
