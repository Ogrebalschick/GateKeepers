import copy
import threading
from pathlib import Path
from typing import Any

import yaml

from app.config import POLICY_PATH

_lock = threading.RLock()
_policy: dict[str, Any] = {}
_policy_version = 0

_REQUIRED_TOP_LEVEL = {"always_block", "agents", "decisions"}
_ALLOWED_ROLES = {"developer", "sre", "admin"}
_ALLOWED_DECISIONS = {"allow", "confirm", "deny", "block", "any", "nonprod", "prod", "names_only"}


def _validate_policy(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Policy root must be a YAML mapping")
    missing = _REQUIRED_TOP_LEVEL - set(data)
    if missing:
        raise ValueError(f"Missing required policy fields: {', '.join(sorted(missing))}")
    if not isinstance(data.get("always_block"), list) or not all(isinstance(x, str) for x in data["always_block"]):
        raise ValueError("always_block must be a list of category names")
    if not isinstance(data.get("agents"), dict) or not data["agents"]:
        raise ValueError("agents must be a non-empty mapping")
    if not isinstance(data.get("decisions"), dict):
        raise ValueError("decisions must be a mapping")
    compatibility = data.get("compatibility", {})
    if not isinstance(compatibility, dict):
        raise ValueError("compatibility must be a mapping")
    nonprod_patterns = compatibility.get("nonprod_resource_patterns", [])
    if not isinstance(nonprod_patterns, list) or not all(isinstance(x, str) and x.strip() for x in nonprod_patterns):
        raise ValueError("compatibility.nonprod_resource_patterns must be a list of non-empty strings")
    for agent_name, agent in data["agents"].items():
        if not isinstance(agent, dict) or not isinstance(agent.get("roles"), dict):
            raise ValueError(f"agents.{agent_name}.roles must be a mapping")
        for role, role_data in agent["roles"].items():
            if role not in _ALLOWED_ROLES:
                raise ValueError(f"Unsupported role in policy: {role}")
            tools = role_data.get("tools", {})
            if not isinstance(tools, dict):
                raise ValueError(f"agents.{agent_name}.roles.{role}.tools must be a mapping")
            for tool, rule in tools.items():
                values = rule.values() if isinstance(rule, dict) else [rule]
                for value in values:
                    if value not in _ALLOWED_DECISIONS:
                        raise ValueError(f"Unsupported policy value for {role}.{tool}: {value}")
    return data


def load_policy(path: str | Path | None = None) -> dict[str, Any]:
    global _policy, _policy_version
    target = Path(path) if path else POLICY_PATH
    if not target.exists():
        raise FileNotFoundError(f"Policy file not found: {target}")
    try:
        parsed = yaml.safe_load(target.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML policy: {exc}") from exc
    validated = _validate_policy(parsed)
    with _lock:
        _policy = copy.deepcopy(validated)
        _policy_version = int(validated.get("version", 1))
        return copy.deepcopy(_policy)


def get_policy() -> dict[str, Any]:
    with _lock:
        if not _policy:
            return load_policy()
        return copy.deepcopy(_policy)


def get_version() -> int:
    with _lock:
        return _policy_version


def reload_policy(yaml_string: str, version: int | None = None) -> int:
    global _policy, _policy_version
    try:
        parsed = yaml.safe_load(yaml_string)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML policy: {exc}") from exc
    validated = _validate_policy(parsed)
    next_version = int(version if version is not None else validated.get("version", _policy_version + 1))
    if next_version < 1:
        raise ValueError("Policy version must be a positive integer")
    validated["version"] = next_version
    with _lock:
        _policy = copy.deepcopy(validated)
        _policy_version = next_version
    return next_version
