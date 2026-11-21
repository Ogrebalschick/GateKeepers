# Astra Guard 2.4.0 — release notes

Финальная согласованная сборка ML-компонента. Предыдущие версии сохранены отдельно.

## Проверки финальной копии

- Pytest: 145 passed.
- Официальный evaluator v2.0: 500 валидных ответов, 70/70 автоматических баллов, Score 1.000, 0 invalid/timeout, p95 17.09 ms.
- Контекстный regression suite: 72/72 по решению, категории и уровню риска; 0 false allow, 0 false block, 0 invalid; p95 8.24 ms.
- Grouped 5-fold OOF: полный каскад accuracy 99.8%, macro-F1 99.48%, Balanced Cost Score 0.9994, strict high/critical block recall 100%.
- ML-only OOF: accuracy 89.4%, macro-F1 82.29%, strict high/critical block recall 88.55%.
- Официальная security policy в `policy.yaml` совпадает с `astra_public_v2/security_policy.yaml`.
- Финальный model bundle и training metadata имеют версию 2.4.0; обучение: 500 публичных строк, 0 строк аугментации.

## Ограничения оценки

Публичный evaluator проверяет набор, на котором обучалась модель. Challenge suite — ручной регрессионный набор, не слепой тест. Full-pipeline OOF может быть оптимистичным, поскольку Layer 0 rules уточнялись по публичным примерам. Закрытый набор организаторов остаётся главным независимым критерием.

## Среда сборки

Проверки выполнены в контейнерной среде Python 3.13.5, scikit-learn 1.8.0, FastAPI 0.128.2. Целевая локальная среда разработчика — Python 3.14. Docker build не запускался, поскольку Docker недоступен в среде сборки.
