# Astra Guard 2.6.0-rc1 — release notes

## Состав релиза

- Layer 0 и Layer 1 из текущей интегрированной версии 2.5.0.
- Клиент llama.cpp использует `/health`, `/tokenize` и `/completion`. Ошибка установления соединения допускает одну повторную попытку.
- Промпт содержит до 500 символов кейса и укладывается в 800 токенов перед генерацией. Модель выдаёт решение по JSON-схеме.
- Переход Layer 1 → Layer 2 при confidence ниже 0.85, если LLM включена.
- Fail-closed fallback: `confirm` при недоступности или невалидном ответе LLM.
- Дополнительные поля `/health`: `llm_enabled`, `llm_available`.
- Опциональный `AI-Guard/docker-compose.llm.yml`.
- 20 новых тестов Layer 2 и интеграции.

## Проверки

- Под Python 3.14.0 прошли 211 тестов, включая 27 тестов HTTP-клиента и маршрутизации Layer 2.
- На RTX 2060 локальная GGUF-модель обработала 7 публичных запросов и 3 отдельных примера с решениями `allow`, `confirm` и `block`. На публичном наборе получено 500/500, 70/70, p95 28,09 мс. [Отчёт](reports/verification_live.json)
- `LLM_ENABLED=false` сохраняет текущий маршрут L0 → L1 и не меняет публичный evaluator.
- При `LLM_ENABLED=true` confidence Layer 1 ниже 0.85 вызывает health check и при доступности — llama.cpp completion.

## Ограничения релиз-кандидата

- В переданном архиве нет GGUF-файла. Реальная модель должна быть предоставлена отдельно и указана через `LLAMA_MODEL_PATH`.
- Docker Compose 2.39.4 проверил ML-конфигурацию для локального и командного вариантов стека. Сборка и запуск образа ожидают Docker-хоста команды. Из `AI-Guard/ml-service` выполнить `docker compose -f compose.verify.yml up --build --exit-code-from verify`.
- Результаты публичного evaluator не доказывают качество на закрытом наборе организаторов.

## Включение Layer 2

Скопируйте `AI-Guard/.env.example` в `AI-Guard/.env`, укажите путь к GGUF-модели и выполните из `AI-Guard`:

```powershell
docker compose -f docker-compose.yml -f docker-compose.llm.yml up --build
```

По умолчанию Layer 2 выключен. Для его включения используется override compose, который задаёт `LLM_ENABLED=true` и подключает llama.cpp server.
