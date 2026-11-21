import threading
import yaml
from pathlib import Path
from typing import Any

from .config import get_settings


class PolicyStore:
    """Потокобезопасный hot-reload политики."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._content: dict[str, Any] = {}
        self._version: int = 0
        self._raw_yaml: str = ""
        self.load_from_file()

    def load_from_file(self) -> None:
        path = Path(get_settings().POLICY_FILE)
        raw = path.read_text(encoding="utf-8")
        self.apply(raw)

    def apply(self, raw_yaml: str) -> int:
        data = yaml.safe_load(raw_yaml)
        if not isinstance(data, dict):
            raise ValueError("policy must be a mapping")
        for key in ("version", "roles"):
            if key not in data:
                raise ValueError(f"policy missing required key: {key}")
        with self._lock:
            self._content = data
            self._version = int(data.get("version", self._version + 1))
            self._raw_yaml = raw_yaml
            return self._version

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    @property
    def raw_yaml(self) -> str:
        with self._lock:
            return self._raw_yaml

    def get_tool_decision(self, role: str, tool: str, env: str) -> str:
        """Возвращает allow / confirm / block. По умолчанию — block."""
        with self._lock:
            try:
                return self._content["roles"][role]["tools"][tool][env]
            except (KeyError, TypeError):
                return "block"

    def is_always_block(self, category: str) -> bool:
        with self._lock:
            return category in (self._content.get("always_block") or [])


policy_store = PolicyStore()
