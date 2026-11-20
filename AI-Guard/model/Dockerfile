FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Укажите путь к llama.cpp
COPY llama.cpp /app/llama.cpp

# Копируем модель
COPY model.gguf /app/model.gguf

CMD ["./llama.cpp", "-m", "/app/model.gguf", "-n", "1024", "-p", "SYSTEM_PROMPT"]
