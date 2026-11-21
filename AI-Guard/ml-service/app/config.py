import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
POLICY_PATH = Path(os.getenv("POLICY_PATH", str(ROOT_DIR / "policy.yaml")))
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(ROOT_DIR / "models" / "guard_model.joblib")))
BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
LLAMA_URL = os.getenv("LLAMA_URL", "http://llama:8080").rstrip("/")
LLM_ENABLED = os.getenv("LLM_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
CLASSIFIER_MIN_CONFIDENCE = float(os.getenv("CLASSIFIER_MIN_CONFIDENCE", "0.58"))
ALLOW_MIN_CONFIDENCE = float(os.getenv("ALLOW_MIN_CONFIDENCE", "0.50"))
ALLOW_BLOCK_MARGIN = float(os.getenv("ALLOW_BLOCK_MARGIN", "0.05"))
RISK_LEVEL_MIN_CONFIDENCE = float(os.getenv("RISK_LEVEL_MIN_CONFIDENCE", "0.30"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "50000"))

MAX_HISTORY_ITEMS = int(os.getenv("MAX_HISTORY_ITEMS", "50"))
MAX_ATTACHMENT_ITEMS = int(os.getenv("MAX_ATTACHMENT_ITEMS", "10"))
MAX_HISTORY_ITEM_CHARS = int(os.getenv("MAX_HISTORY_ITEM_CHARS", "20000"))
MAX_ATTACHMENT_CHARS = int(os.getenv("MAX_ATTACHMENT_CHARS", "25000"))
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "100000"))
