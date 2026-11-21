# Astra Guard ML Service 2.4.0

Изолированный защитный сервис для кейса «ИИ-сторож» v2.0. Он проверяет пользовательскую инструкцию и доступный контекст до передачи запроса целевому ИИ-агенту. Сервис не исполняет shell-команды и не вызывает инфраструктурные инструменты.

## Состав

- **Layer 0:** детерминированные правила для prompt injection, jailbreak, indirect injection, system prompt extraction/override, privilege escalation, data exfiltration, harmful content, fraud/social engineering, abuse и RBAC.
- **Normalizer:** NFKC, zero-width, Base64, обратный текст, разделённые символы, homoglyph, leetspeak и смешанные кириллическо-латинские варианты.
- **Layer 1:** локальная модель scikit-learn с тремя классификационными головами: решение, категория угрозы и уровень риска. Используется общий word/character TF-IDF-векторизатор; текст векторизуется один раз на запрос.
- **Context analysis:** отдельная обработка пользовательских сообщений истории и вложений. Цитируемые или анализируемые инструкции не считаются автоматически активными командами; действующие инструкции во вложениях остаются недоверенными.
- **Layer 2:** необязательный локальный llama.cpp клиент, выключен по умолчанию. Внешние LLM API не используются.
- **FastAPI:** `POST /v1/check`, `GET /health`, `POST /internal/reload-policy`.
- **Startup warm-up:** загрузка и прогрев модели до начала приёма запросов.
- **Input limits:** ограничения размера запроса, истории, вложений и суммарного контекста.

## Среда

- Локальная разработка: Python **3.14**.
- Dockerfile: Python **3.11-slim**, как в исходном контракте кейса.
- Контрольные тесты этой сборки выполнены в среде Python 3.13.5 со зафиксированными версиями библиотек; локальный повторный прогон на твоём Python 3.14 обязателен. Docker build не выполнялся: Docker отсутствовал в среде сборки.
- Зависимости зафиксированы в `requirements.txt`.

### Windows PowerShell

```powershell
py -3.14 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Проверка готовности: `http://127.0.0.1:8000/health`. Ожидается `version: 2.4.0`, `model_loaded: true`, `model_warmed_up: true`. Swagger: `http://127.0.0.1:8000/docs`.

### Linux / macOS

```bash
python3.14 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
pytest -q
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Модель и признаки

В поставляемом `models/guard_model.joblib` находятся три классификатора и общий TF-IDF-векторизатор. Модель обучена на 500 строках официального `astra_public_v2/dev.jsonl`; синтетическая аугментация в финальный bundle не включалась.

Используются только доступные при реальной проверке поля:

- текущий `user_prompt`;
- доверенная роль `context.user_role`;
- история пользовательских сообщений;
- содержимое и метаданные вложений, доступные в контексте.

Идентификаторы, `tags`, `difficulty`, `lang`, `expected_decision`, `risk_category`, `risk_level`, `is_dangerous` и прочие разметочные поля датасета не используются как признаки.

Обучение воспроизводится командой:

```powershell
python scripts/train_model.py --data astra_public_v2/dev.jsonl --output models/guard_model.joblib --decision-class-weight none --alpha 0.0001
```

## Результаты контрольной проверки 2.4.0

Все отчёты находятся в `reports/`.

### Официальный evaluator v2.0

| Метрика | Результат |
|---|---:|
| Примеры | 500 / 500 |
| Автоматические баллы | **70 / 70** |
| Balanced Cost Score | 1.000 |
| High/Critical strict block recall | 100% |
| Risk-category accuracy | 100% |
| Hard-negative block rate | 0% |
| Invalid / timeout | 0 |
| p95 latency | 17.09 ms |

`cpu_bonus_timing_and_quality_candidate` отмечен evaluator как `true`. Это только кандидат на CPU-бонус; окончательное решение принимают организаторы на своём оборудовании.

### Контекстный regression suite

Вручную составленный набор `tests/data/challenge_v24.jsonl` содержит 72 сценария: прямые атаки, безопасные запросы, RBAC, историю и вложения.

| Метрика | Результат |
|---|---:|
| Совпадение решения | 72 / 72 |
| Совпадение категории | 72 / 72 |
| Совпадение уровня риска | 72 / 72 |
| Ошибочные allow | 0 |
| Ложные block на allow | 0 |
| Некорректные ответы | 0 |
| p95 latency | 8.24 ms |

Это регрессионный набор, а не слепая независимая выборка: правила и тесты дорабатывались совместно. Он не заменяет закрытый набор организаторов.

### Пятифолдовая grouped OOF-валидация

Разбиение: `StratifiedGroupKFold`, 5 folds, seed 42, 500 публичных примеров. Похожие примеры группируются по запросу, истории и вложениям.

| Метрика | Полный каскад | Только ML Layer 1 |
|---|---:|---:|
| Accuracy | 99.8% | 89.4% |
| Macro-F1 решений | 99.48% | 82.29% |
| Balanced Cost Score | 0.9994 | 0.9455 |
| High/Critical strict block recall | 100% | 88.55% |
| Hard-negative block rate | 0% | 3% |
| Risk category accuracy на block | 100% | 64% |
| Risk level accuracy | 99.8% | 81.4% |

В полном каскаде Layer 0 обработал 290 из 500 примеров, Layer 1 — 210. Поскольку правила Layer 0 уточнялись с учётом публичного набора, полные OOF-метрики могут быть оптимистичными. `Model only` отделяет ML от Layer 0, но тоже основан на небольшом публичном наборе.

**Главный критерий обобщения — закрытый набор организаторов.** Публичный evaluator подтверждает совместимость API и отсутствие регрессий на предоставленных примерах, но не доказывает качество на неизвестных атаках.

## Проверки

### Автоматические тесты

```powershell
pytest -q
```

Контрольный результат: **145 passed**.

### Контекстный regression suite

При работающем сервере:

```powershell
python scripts/run_adversarial_suite.py `
  --endpoint http://127.0.0.1:8000/v1/check `
  --data tests/data/challenge_v24.jsonl `
  --report reports/challenge_v24.json `
  --predictions reports/challenge_v24_predictions.jsonl
```

### Официальный evaluator

```powershell
python astra_public_v2/evaluate.py `
  --data astra_public_v2/dev.jsonl `
  --endpoint http://127.0.0.1:8000/v1/check `
  --report reports/official_evaluator_v24.json `
  --save-predictions reports/official_evaluator_v24_predictions.jsonl
```

### Grouped OOF

```powershell
python scripts/validate_model.py `
  --data astra_public_v2/dev.jsonl `
  --report reports/grouped_validation_oof_v24.json `
  --predictions reports/grouped_validation_oof_predictions_v24.jsonl
```

## API и интеграция

`POST /v1/check` сохраняет совместимость с официальным evaluator и не требует авторизации. Пример:

```json
{
  "user_prompt": "Restart payments-api in production.",
  "context": {
    "target_agent": "it_ops_agent",
    "user_role": "developer",
    "user_id": "u-example",
    "user_name": "Example User",
    "system_prompt": "",
    "history": [],
    "attachments": []
  }
}
```

Ответ содержит `decision`, `risk_level`, `risk_category`, `explanation`, `latency_ms`, `pipeline_layer` и `check_id`.

**Граница доверия:** в GateKeepers Frontend не должен вызывать этот маршрут напрямую. Backend должен проверять JWT, получать роль из доверенной серверной сессии, собирать историю из своей базы и передавать ML-service уже проверенный контекст. Не доверяйте `user_role`, `user_id` или истории, присланным браузером без серверной проверки.

`POST /internal/reload-policy` принимает YAML-политику и версию. `policy.yaml` в этой сборке совпадает с официальной `security_policy.yaml` из набора кейса.

### Backend logging

`BACKEND_URL` пустой по умолчанию. Если Backend реализует `POST /internal/checks`, можно задать его внутренний URL в окружении. Недоступность Backend не должна влиять на решение `/v1/check`. До реализации маршрута оставляйте `BACKEND_URL` пустым.

### Layer 2

По умолчанию выключен (`LLM_ENABLED=false`). Если он будет включён, допускается только локальный llama.cpp endpoint. Его качество и задержку необходимо оценивать отдельно; основной Layer 0 + Layer 1 должен оставаться работоспособным без него.

## Ограничения и безопасность

- Сервис только классифицирует запросы; он не исполняет команды и не вызывает инструменты.
- `confirm` не является разрешением на выполнение. Backend должен требовать отдельного явного подтверждения и повторно проверять неизменность запроса.
- При `block`, ошибке проверки или недоступности ML-service запрос нельзя передавать целевому агенту.
- `/v1/check` без авторизации предназначен для evaluator и внутренней сети. Не публикуйте его напрямую в интернет.
- Внешние LLM API не используются.
- Публичные и вручную составленные тесты не заменяют закрытую оценку организаторов.
