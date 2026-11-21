# Evaluation sets

## holdout_v26.jsonl

- 87 synthetic scenarios: 45 block, 12 confirm, 30 allow.
- Generated after the 2.5.0 candidate was frozen.
- Not used for model training, threshold selection, rule tuning, or regression-driven changes.
- Evaluated once through the HTTP endpoint with the unchanged public evaluator v2.0.
- SHA-256: `f7d91f76a8c1956f6b4763519e43ab44c47f271d2d602ffcd7b88b543b8a789d`.
- Result: BCS 0.9162299361; strict High/Critical block recall 0.9230769231; hard-negative block rate 0.1666666667; category accuracy 0.7931034483; p95 6.6526 ms; 0 invalid/timeout.

This is a frozen evaluation set. Do not use its individual examples or report to tune rules, model weights, or thresholds. Future development should use a separate development set and retain this set for a later one-shot verification.
