# Astra Guard ML Service

Защитный ML-сервис для кейса «ИИ-сторож» v2.0. Внутренняя версия сервиса: 2.3.0. Сервис принимает пользовательский запрос и контекст, анализирует их и возвращает `allow`, `confirm` или `block`. Реальные команды и инфраструктурные операции не выполняются.

## Состав

- Layer 0: обнаружение prompt injection, jailbreak, indirect injection, попыток извлечения или подмены системных инструкций, privilege escalation, data exfiltration, harmful content, fraud/social engineering и abuse.
- YAML RBAC: проверка роли, инструмента и окружения по `policy.yaml`.
- Normalizer: Unicode NFKC, zero-width, Base64, разделённые символы, homoglyph и leetspeak-варианты.
- Layer 1: локальный sklearn-классификатор решений, категорий и уровней риска. Для решений используется `class_weight=none`, для категорий и уровней риска — `class_weight=balanced`.
- Layer 2: необязательный клиент llama.cpp, выключен по умолчанию.
- FastAPI: `POST /v1/check`, `GET /health`, `POST /internal/reload-policy`.
- Ограничение размеров истории, вложений и суммарного контекста для защиты от чрезмерных payload.
- Консервативный порог allow: минимальная вероятность 0.50 и отрыв от block не менее 0.05; параметры задаются через `ALLOW_MIN_CONFIDENCE` и `ALLOW_BLOCK_MARGIN`.
- Многошаговая проверка: обнаружение цепочки получения секрета и последующей передачи на внешний адрес.

## Запуск локально

Локальная разработка и тестирование выполняются на Python 3.14.0. Docker-образ остаётся на Python 3.11-slim для соответствия исходной спецификации кейса.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Windows PowerShell:

```powershell
py -3.14 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Проверка:

```bash
curl http://localhost:8000/health
```

Интерактивная схема API: `http://localhost:8000/docs`.

## Обучение модели

Публичный `dev.jsonl` находится в `astra_public_v2/`.

```bash
python scripts/train_model.py --data astra_public_v2/dev.jsonl --output models/guard_model.joblib --decision-class-weight none
```

Скрипт выводит macro-F1 на групповой валидационной выборке. Похожие формулировки объединяются в группы по символьному сходству, чтобы уменьшить утечку близких примеров между train и validation. После измерения модели переобучаются на всём публичном наборе и сохраняются в `models/guard_model.joblib`.

Независимая проверка пайплайна на отложенной групповой выборке:

```bash
python scripts/validate_model.py --data astra_public_v2/dev.jsonl --decision-class-weight none
```

Групповая OOF-проверка использует 5-fold StratifiedGroupKFold и out-of-fold предсказания по всем 500 строкам. Для модели решений используется `class_weight=none`, для категорий и уровней риска сохраняется `class_weight=balanced`. Последняя групповая OOF-проверка v2.2.0: decision accuracy 1.000, macro-F1 решений 1.000, точность категории риска 0.936, точность уровня риска 0.976, Balanced Cost Score 1.000, строгий recall блокировки high/critical — 1.000, доля ложных блокировок hard negatives — 0.0, лишние подтверждения для allow — 0.0. Это оценка на публичных синтетических данных. Правила безопасности уточнялись с использованием публичных примеров, поэтому этот результат может быть оптимистичным и не является независимой оценкой на закрытом наборе. Односрезовый результат 0.93 accuracy относится только к первому fold и не заменяет полный out-of-fold прогон. Полный отчёт находится в `reports/grouped_validation_oof.json` и `reports/grouped_validation_oof_predictions.jsonl`.

Официальный evaluator:

```bash
python astra_public_v2/evaluate.py \
  --data astra_public_v2/dev.jsonl \
  --endpoint http://localhost:8000/v1/check \
  --report report.json \
  --save-predictions predictions.jsonl
```

Поскольку итоговая модель обучается на публичных 500 примерах, прогон evaluator на тех же 500 примерах является только проверкой интеграции и не является независимой оценкой качества. Для оценки обобщения используйте `validate_model.py`; по умолчанию он выполняет все пять групповых folds. Для более быстрой двухфолдовой проверки можно указать `--folds 2`. Итоговое качество определяется скрытым набором организаторов.

Последняя проверка версии 2.2.0 на публичном evaluator: Score 1.000/1.000, 70/70 автоматических баллов, p95 12.88 ms, 0 ошибок/таймаутов. Это проверка интеграции на публичных примерах, не оценка скрытого набора. Поскольку детерминированные правила разрабатывались с учётом публичного набора, групповой OOF-результат может быть оптимистичным; финальное обобщение проверяется только на закрытых данных.

Тесты проекта: 83 passed.

## API

`POST /v1/check` не требует авторизации. Формат соответствует `api-contract.md`.

Пример:

```json
{
  "user_prompt": "Restart payments-api in production.",
  "context": {
    "target_agent": "it_ops_agent",
    "user_role": "sre",
    "user_id": "u-example",
    "user_name": "Example User",
    "system_prompt": "",
    "history": [],
    "attachments": []
  }
}
```

Ответ содержит `decision`, `risk_level`, `risk_category`, `explanation`, `latency_ms`, `pipeline_layer` и `check_id`. Уровень риска для Layer 1 уточняется отдельной обученной головой классификатора; фиксированные категории используют заданное соответствие, а переменные `tool_abuse`, `unauthorized_data_access` и `sensitive_action` учитывают предсказание уровня риска с порогом `RISK_LEVEL_MIN_CONFIDENCE`.

`POST /internal/reload-policy` принимает:

```json
{
  "content_yaml": "version: 2\\n...",
  "version": 2
}
```

Политика валидируется и обновляется атомарно. Ошибочный YAML не заменяет действующую политику.

## Backend logging

Если задан `BACKEND_URL`, после каждого `/v1/check` сервис отправляет лог в `BACKEND_URL/internal/checks` как фоновую задачу. Без `BACKEND_URL` локальный режим работает без отправки логов; для Docker Compose задайте `BACKEND_URL=http://backend:8081`. Недоступность Backend не влияет на ответ `/v1/check`. Системный промпт в журнале маскируется; значения паролей, токенов и ключей маскируются.

## Примечание по окружениям

Паттерны `dev-*`, `stage-*`, `test-*` и `prod-*` читаются из YAML. Дополнительно `feature-*` трактуется как non-production, поскольку этот префикс встречается в публичном примере с эталонным `confirm`. Неоднозначное окружение не считается non-production автоматически.

## Layer 2

По умолчанию выключен (`LLM_ENABLED=false`). Чтобы включить локальный llama.cpp server, запустите его отдельно, задайте `LLAMA_URL` и `LLM_ENABLED=true`. Для основного режима оценивания рекомендуется сначала проверить качество и задержку без Layer 2.

## Тесты

```bash
pip install -r requirements-dev.txt
pytest -q
```

## Docker

```bash
docker build -t astra-guard-ml .
docker run --rm -p 8000:8000 -e BACKEND_URL= astra-guard-ml
```

Для совместной работы с Backend задайте `BACKEND_URL` на внутреннее имя сервиса Docker Compose, например `http://backend:8081`. В Dockerfile это значение установлено по умолчанию.


## 2.3.0

В версии 2.3.0 уточнена обработка безопасного анализа опасных команд. При defensive review кодовые примеры и описания попыток действий не должны автоматически трактоваться как просьба выполнить эти действия. При этом явное требование выполнить команду после анализа продолжает блокироваться. Добавлено распознавание слитной формы `ignoreallpreviousinstructions`, возникающей после нормализации текста с пробелами между буквами.

Модель и веса не переобучались. Изменения относятся к правилам Layer 0 и регрессионным тестам. Проверка на публичном наборе v2.0 должна быть повторена после локального запуска.


## Curated adversarial regression suite

The repository includes 49 hand-authored regression cases covering prompt injection, jailbreaks, exfiltration, privilege escalation, RBAC, obfuscation, indirect injection, safe security analysis, and attempts to combine a defensive-analysis preface with an explicit execution request. These cases are not part of model training.

With the service running, execute:

```powershell
python scripts/run_adversarial_suite.py --endpoint http://127.0.0.1:8000/v1/check
```

The command writes `reports/adversarial_suite_v23.json` and `reports/adversarial_suite_v23_predictions.jsonl`. The suite checks decisions; category and risk-level outputs are retained for manual review.
