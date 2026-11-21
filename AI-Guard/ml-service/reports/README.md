# Astra Guard 2.5.0 — отчёты

- `release_v25_official.json` и `release_v25_official_predictions.jsonl` — HTTP-прогон официального evaluator v2.0 на 500 публичных примерах после переобучения модели.
- `release_v25_challenge_dev.json` и `release_v25_challenge_dev_predictions.jsonl` — 91-сценарный challenge dev-набор, использованный при разработке; не является blind holdout.
- `grouped_validation_oof_v25.json` и `grouped_validation_oof_predictions_v25.jsonl` — 5-fold grouped OOF на публичных 500 строках с 384 дополнительными синтетическими строками только в обучающей части folds.
- `model_card_v25.md` — модель, назначение, метрики и ограничения.
- `../evaluation/holdout_v26.jsonl`, `holdout_v26_report.json`, `holdout_v26_predictions.jsonl` — одноразовая независимая оценка после заморозки кода; набор не использовался для настройки.
- `model_card_v24.md`, `release_v24_*` — архивные материалы контрольной версии 2.4.0; не являются результатами 2.5.0.

## Интерпретация

Публичный evaluator проверяет совместимость и отсутствие регрессий на разрешённом публичном наборе; он не доказывает обобщение на закрытый набор. Challenge v26 dev использовался для разработки и также не является слепой выборкой. Grouped OOF разделяет похожие примеры между folds, однако Layer 0 дорабатывался с использованием публичных данных, поэтому full-pipeline метрики могут быть оптимистичными. Для оценки качества самой модели см. `model_only` в OOF-отчёте. Независимый holdout v26 выявил BCS 91.62% и hard-negative block rate 16.67%; его нельзя использовать для последующей настройки.
