# Model Card — Astra Guard 2.4.0

## Intended use

Локальный предварительный защитный классификатор для проверки пользовательских инструкций и доступного контекста перед передачей целевому ИИ-агенту. Сервис возвращает `allow`, `confirm` или `block`; не выполняет действия и не заменяет авторизацию Backend.

## Model

- Classifier: `SGDClassifier(loss="log_loss")`.
- Features: общий `FeatureUnion` из word TF-IDF (1–2 грамма) и char-wb TF-IDF (2–5 граммов).
- Heads: decision, threat category, risk level.
- Decision head: `class_weight=None`.
- Category and risk heads: balanced class weights.
- Training rows: 500.
- Training source: официальный `astra_public_v2/dev.jsonl`.
- Synthetic augmentation in final model: 0 rows.
- Feature schema: `v2.4_intent_normalized_role_tagged_context`.

## Inputs

Текущий запрос, доверенная роль, пользовательская история и вложения. Разметка датасета и поля `id`, `tags`, `difficulty`, `lang`, `expected_decision`, `risk_category`, `risk_level`, `is_dangerous` не являются признаками.

## Validation

- Official evaluator v2.0: 500/500 валидных ответов, 70/70 автоматических баллов, Score 1.000, strict high/critical block recall 100%, hard-negative block rate 0%, p95 17.09 ms.
- Manual challenge suite: 72/72 по решению, категории и уровню риска; 0 false allow и 0 false block; p95 8.24 ms.
- Grouped 5-fold OOF, seed 42: full pipeline accuracy 99.8%, macro-F1 99.48%, Balanced Cost Score 0.9994, strict high/critical block recall 100%. Model-only accuracy 89.4%, macro-F1 82.29%, strict high/critical block recall 88.55%.
- Unit/API tests: 145 passed.

## Limitations

- Публичный датасет содержит только 500 синтетических примеров и используется для обучения.
- Полный pipeline OOF оптимистичен, поскольку правила Layer 0 уточнялись с учётом публичного набора.
- Challenge suite является ручным регрессионным набором, а не слепой независимой выборкой.
- История и вложения представлены в публичном наборе ограниченно; многошаговые сценарии проверяются дополнительным набором, но закрытый тест может содержать другие формы атак.
- Категорийная и severity-классификация Layer 1 заметно слабее классификации решения; Layer 0 и RBAC вносят значимый вклад в итоговое качество.
- Итоговое качество на закрытом наборе и целевом оборудовании заранее неизвестно.

## Safety notes

`/v1/check` не требует авторизации для совместимости с evaluator. В рабочей системе его должен вызывать только Backend после проверки JWT и формирования доверенного контекста. `confirm` не разрешает действие без отдельного подтверждения человека. При ошибке проверки запрос не должен передаваться целевому агенту.
