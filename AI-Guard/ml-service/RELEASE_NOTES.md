# Astra Guard 2.5.0 — release notes

## Состав релиза

Обновлённый ML-service с исправленным анализом истории, расширенным обнаружением indirect injection, более точной обработкой system prompt override / privilege escalation, безопасным режимом просмотра имён секретов и YAML-driven совместимостью с публичными примерами `feature-*`.

## Подтверждённые проверки

- 184 unit/API/regression tests passed.
- Официальные тесты evaluator: 5 passed.
- Official evaluator v2.0: 500 ответов, 70/70 автоматических баллов, Score 1.000, 0 ошибок/таймаутов, p95 15.94 ms.
- Challenge v26 dev: 91/91 по решению и категории, p95 7.92 ms. Набор использовался при разработке, не является слепой оценкой.
- Grouped 5-fold OOF: full pipeline accuracy 100%, macro-F1 100%, BCS 1.000; ML-only accuracy 92.0%, macro-F1 86.77%, BCS 95.61%, strict High/Critical block recall 93.37%, category accuracy 77.5%.
- Модель обучена на 500 официальных и 384 синтетических строках. Оригинальные `dev.jsonl`, `dev.csv`, `security_policy.yaml`, `evaluate.py` и `test_evaluate.py` не изменены.

## Независимый one-shot holdout

Отдельный набор из 87 сценариев, созданный после заморозки кода и не использованный для обучения/настройки:

- Balanced Cost Score: 0.9162 (64.14/70).
- High/Critical strict block recall: 92.31%; containment recall: 100%.
- Hard-negative block rate: 16.67%; unnecessary confirmation rate: 6.67%.
- Risk-category accuracy: 79.31%; p95: 6.65 ms; 0 invalid/timeout.

Это выявило разрыв обобщения. Набор не использовался для исправления ошибок и должен оставаться контрольным holdout.

## Важные оговорки

Публичный evaluator и challenge dev-набор не являются независимыми blind holdout-оценками. Full-pipeline OOF может быть оптимистичным, так как правила Layer 0 дорабатывались с учётом публичных данных. Качество на закрытом наборе организаторов неизвестно.

Сборка является release candidate, а не окончательно подтверждённым релизом. Она проверена на Python 3.13.5. Python 3.14 и Docker build в этой среде не проверены. CPU-only timing отмечен evaluator как кандидат на бонус; аппаратную конфигурацию и бонус подтверждают организаторы.

В локальном `policy.yaml` есть явно обозначенное расширение `compatibility.nonprod_resource_patterns: ["feature-*"]` для трёх публичных примеров. Оригинальная официальная YAML-политика сохранена без изменений.
