# Model Card — Astra Guard 2.5.0

## Intended use

Локальный защитный компонент для анализа пользовательской инструкции, доверенной роли, истории и извлечённого текста вложений до передачи запроса целевому DevOps-агенту. Сервис выдаёт `allow`, `confirm` или `block`; не исполняет команды и не заменяет авторизацию Backend.

## Model

- Classifier: `SGDClassifier(loss="log_loss")`.
- Features: `FeatureUnion` из word TF-IDF (1–2 грамма) и char-wb TF-IDF (2–5 граммов).
- Heads: decision, threat category, risk level.
- Training: 500 официальных публичных строк + 384 синтетических строки; всего 884.
- Category head обучается на `block` примерах; risk-level head — на `block` и `confirm`.
- Seed: 42; grouped split использует scenario family и сходство запроса, истории и вложений.
- Поля разметки не используются как признаки.

## Verification

- Python 3.13.5; FastAPI 0.128.2; scikit-learn 1.8.0; NumPy 2.3.5.
- Pytest: 184 passed.
- Official evaluator v2.0: 500/500, Score 1.000, 70/70, strict High/Critical block recall 100%, hard-negative block rate 0%, p95 15.94 ms.
- Challenge v26 dev: 91/91, strict High/Critical block recall 100%, hard-negative block rate 0%, p95 7.92 ms. Набор использовался для разработки; это не blind holdout.
- Grouped 5-fold OOF, seed 42:
  - Rules-only: accuracy 63.4%, macro-F1 59.40%, BCS 89.24%, rule coverage 62.6%, strict High/Critical recall 91.57%, hard-negative block rate 0%.
  - ML-only: accuracy 92.0%, macro-F1 86.77%, BCS 95.61%, strict High/Critical recall 93.37%, hard-negative block rate 5%, category accuracy 77.5%, risk-level accuracy 84.4%.
  - Full pipeline: accuracy 100%, macro-F1 100%, BCS 1.000, strict High/Critical recall 100%, hard-negative block rate 0%, category accuracy 99%, risk-level accuracy 99.6%.

## Independent one-shot holdout

87 сценариев, созданных после freeze и не использованных для обучения или настройки:

- Balanced Cost Score: 91.62% (64.14/70).
- High/Critical strict block recall: 92.31%; containment recall: 100%.
- Hard-negative block rate: 16.67%; unnecessary confirmation rate: 6.67%.
- Risk-category accuracy: 79.31%; p95 6.65 ms; 0 invalid/timeout.

Этот результат показывает разрыв обобщения по сравнению с публичным evaluator и challenge dev. Отдельные ошибки не анализировались, параметры не менялись. Holdout следует сохранить для будущей финальной проверки, не использовать для настройки.

## Limitations

- Публичный датасет содержит 500 синтетических примеров; 384 дополнительных синтетических примера увеличивают разнообразие, но не заменяют независимые реальные данные.
- Публичный evaluator и challenge dev-набор не являются независимой слепой оценкой. Layer 0 rules дорабатывались по публичным данным; full-pipeline OOF может быть оптимистичным.
- ML-only category accuracy 77.5% показывает, что самостоятельное определение категории остаётся слабее, чем определение решения. Полный каскад получает большую часть точности категорий от детерминированных правил.
- Закрытый набор организаторов (около 3000 примеров) недоступен; его результаты неизвестны.
- Независимый holdout v26 показывает, что ложные блокировки hard negatives и ошибки категорий остаются существенной проблемой; версия должна рассматриваться как кандидат.
- Python 3.14 и Docker build не проверены в текущей среде.
- p95 и CPU-only статус подтверждаются организаторами на их оборудовании; локальный прогон не гарантирует бонус.

## Safety notes

`/v1/check` не требует авторизации для evaluator. В реальной интеграции его должен вызывать Backend после проверки JWT и формирования доверенного контекста. `user_role` из браузера не является доверенным. `confirm` не даёт полномочий и требует отдельного подтверждения для неизменного запроса. При `block`, ошибке проверки или недоступности ML-service передача запрещена.
