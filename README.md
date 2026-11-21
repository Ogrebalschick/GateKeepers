# GateKeepers — Astra Guard

## Запуск интегрированного проекта

1. Перейдите в папку `AI-Guard`.
2. Скопируйте шаблон окружения:

```powershell
Copy-Item .env.example .env
```

3. Заполните в `.env` собственные значения `MYSQL_ROOT_PASSWORD` и `DB_PASSWORD`. Не используйте демонстрационные пароли на публичном сервере.
4. Запустите Backend, Frontend, MariaDB и ML-service:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Layer 2 по умолчанию выключен (`LLM_ENABLED=false`). В таком режиме ML-service использует Layer 0 и Layer 1; официальный evaluator 2.0 остаётся на проверенной конфигурации 70/70.

## Включение Layer 2 (опционально)

Layer 2 использует локальный llama.cpp server. GGUF-модель в репозиторий не включена.

1. Поместите GGUF-файл в `AI-Guard/models/`.
2. В `AI-Guard/.env` укажите путь, например `LLAMA_MODEL_PATH=./models/your-model.gguf`.
3. Запустите расширенную конфигурацию:

```powershell
docker compose -f docker-compose.yml -f docker-compose.llm.yml up -d --build
```

Расширенная конфигурация запускает llama.cpp в той же внутренней Docker-сети и включает `LLM_ENABLED=true`. Не публикуйте порт llama.cpp в интернет.

Подробности Layer 2, параметры и ограничения: `AI-Guard/ml-service/README.md`.
