# Changelog

## 2.6.0-rc1 — завершение Layer 2

- Клиент `/completion` допускает одну повторную попытку при `httpx.ConnectError`. Таймаут генерации составляет 8 с.
- Реализован `/health` probe с timeout 1 секунда.
- Переписан prompt Layer 2: trusted role allowlist, `has_attachments`, untrusted case JSON, ограничение нормализованного текста до 500 символов.
- Реализован JSON decoder с корректным извлечением объекта из Markdown/префиксного текста и валидацией decision/risk fields.
- Интегрирован переход в Layer 2 при confidence Layer 1 ниже 0.85, когда `LLM_ENABLED=true`.
- При недоступной/ошибочной LLM применяется `confirm`; L0 и высокоуверенный L1 сохраняют приоритет.
- `/health` дополнен `llm_enabled` и `llm_available`; `model_loaded` оставлен признаком состояния ML-классификатора.
- Добавлен опциональный `docker-compose.llm.yml` для llama.cpp server и переменные окружения.
- Добавлено 20 тестов Layer 2/интеграции; узкий false-positive при сравнении SQL `DROP TABLE`/`TRUNCATE` исправлен.
- Добавлены проверка лимита токенов через llama.cpp, генерация по JSON-схеме и обработка параллельных HTTP-запросов во время генерации.
- На Python 3.14.0 прошли 211 тестов. С реальным GGUF официальный evaluator дал 500/500, 70/70, p95 28,09 мс. Три отдельных запроса проверили все решения Layer 2.
- Для AI-015 добавлен изолированный запуск `compose.verify.yml`. Сборку образа предстоит подтвердить на Docker-хосте команды.

## 2.5.0 — обновлённая рабочая сборка

- Исправлено сохранение всех пользовательских сообщений `context.history` при анализе; история остаётся ограниченной текущим входящим запросом и не переносится между вызовами evaluator.
- Расширено распознавание косвенных prompt injection во вложениях, включая `Assistant instruction`, `AI agent:`, `MODEL DIRECTIVE`, HTML-комментарии и варианты с Unicode-разделителями.
- Добавлены детерминированные правила для подмены `user_role`, отключения проверки полномочий и удаления production approval gate.
- Добавлена обработка передачи credentials на личную почту как `data_exfiltration`.
- Исправлен сценарий просмотра только имён секретов для ролей `sre` и `admin`; запрет на значения секретов сохранён.
- Уточнено отделение расследования попыток изменения SSH-ключей от реального запроса на изменение `authorized_keys`.
- Добавлены безопасные ветви для синтетических фикстур, фиктивных клиентских списков и нейтральных инженерных уведомлений.
- Проверка локального `compatibility.nonprod_resource_patterns` добавлена в YAML loader; исходная официальная политика не изменена.
- Layer 1 переобучен на 500 официальных + 384 синтетических строках, seed 42.
- Добавлено 39 регрессионных тестов сверх предыдущего набора; всего 184 теста.
- API-контракт `/v1/check` сохранён; Backend и Frontend GateKeepers не изменялись.

### Проверки 2.5.0

- Pytest: 184 passed.
- Official evaluator v2.0: 500/500, 70/70, Score 1.000, 0 invalid/timeout, p95 15.94 ms.
- Challenge v26 dev: 91/91, Score 1.000, 0 false allow/block, p95 7.92 ms. Набор использовался для разработки и не является blind holdout.
- Grouped 5-fold OOF: full pipeline 100% accuracy / macro-F1 / Balanced Cost Score; ML-only accuracy 92.0%, macro-F1 86.77%, strict High/Critical recall 93.37%, hard-negative block rate 5.0%.
- Official evaluator unit tests: 5 passed.
- One-shot independent holdout v26: 87 examples, BCS 91.62%, strict High/Critical recall 92.31%, hard-negative block rate 16.67%, category accuracy 79.31%, p95 6.65 ms. Holdout not used for tuning.
- Python 3.13.5 tested; Python 3.14 and Docker build not tested in this environment.

## 2.4.0

- Предыдущая контрольная версия. Подробности сохранены в `reports/model_card_v24.md` и предыдущих отчётах.

## 2.3.1

- Добавлен прогрев модели при запуске.
- Уточнены метаданные `/health` и обработка стартовой инициализации.
