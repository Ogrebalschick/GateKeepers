
import threading
from pathlib import Path
from typing import Any

import yaml

from .config import get_settings


class PolicyYAMLError(ValueError):
    """Некорректный YAML."""


class PolicySchemaError(ValueError):
    """YAML не соответствует схеме политики."""


_ALLOWED_ROLES = {"developer", "sre", "admin"}

_ALLOWED_TOOL_DECISIONS = {
    "allow",
    "confirm",
    "deny",
    "any",
    "nonprod",
    "prod",
}

_ALLOWED_SECRET_DECISIONS = {
    "deny",
    "names_only",
}

_REQUIRED_TOP_LEVEL = {
    "version",
    "decisions",
    "always_block",
    "context_dependent",
    "agents",
}


def _require_string_list(value: Any, field: str) -> None:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and item.strip()
        for item in value
    ):
        raise PolicySchemaError(f"{field} must be a list of strings")


def _validate_tool_rule(rule: Any, field: str) -> None:
    if isinstance(rule, str):
        if rule not in _ALLOWED_TOOL_DECISIONS:
            raise PolicySchemaError(
                f"Unsupported decision in {field}: {rule}"
            )
        return

    if not isinstance(rule, dict) or not rule:
        raise PolicySchemaError(
            f"{field} must be a decision string or mapping"
        )

    for environment, decision in rule.items():
        if environment not in {"prod", "nonprod", "any"}:
            raise PolicySchemaError(
                f"Unsupported environment in {field}: {environment}"
            )

        if decision not in _ALLOWED_TOOL_DECISIONS:
            raise PolicySchemaError(
                f"Unsupported decision in {field}: {decision}"
            )


def validate_policy(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise PolicySchemaError("Policy root must be a YAML mapping")

    missing = _REQUIRED_TOP_LEVEL - set(data)
    if missing:
        raise PolicySchemaError(
            f"Missing required policy fields: {', '.join(sorted(missing))}"
        )

    version = data["version"]
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise PolicySchemaError(
            "Policy version must be a positive integer"
        )

    if not isinstance(data["decisions"], dict):
        raise PolicySchemaError("decisions must be a mapping")

    for name, description in data["decisions"].items():
        if not isinstance(name, str) or not isinstance(description, str):
            raise PolicySchemaError(
                "decisions must map decision names to descriptions"
            )

    _require_string_list(data["always_block"], "always_block")
    _require_string_list(data["context_dependent"], "context_dependent")

    agents = data["agents"]
    if not isinstance(agents, dict) or not agents:
        raise PolicySchemaError("agents must be a non-empty mapping")

    for agent_name, agent in agents.items():
        if not isinstance(agent_name, str) or not agent_name.strip():
            raise PolicySchemaError("Agent names must be non-empty strings")

        if not isinstance(agent, dict):
            raise PolicySchemaError(
                f"agents.{agent_name} must be a mapping"
            )

        _require_string_list(
            agent.get("tools"),
            f"agents.{agent_name}.tools",
        )

        environments = agent.get("environments")
        if not isinstance(environments, dict) or not environments:
            raise PolicySchemaError(
                f"agents.{agent_name}.environments must be a mapping"
            )

        for env_name, patterns in environments.items():
            if not isinstance(env_name, str) or not env_name:
                raise PolicySchemaError(
                    f"Invalid environment name in agents.{agent_name}"
                )
            _require_string_list(
                patterns,
                f"agents.{agent_name}.environments.{env_name}",
            )

        roles = agent.get("roles")
        if not isinstance(roles, dict) or not roles:
            raise PolicySchemaError(
                f"agents.{agent_name}.roles must be a non-empty mapping"
            )

        for role, role_data in roles.items():
            if role not in _ALLOWED_ROLES:
                raise PolicySchemaError(
                    f"Unsupported role in policy: {role}"
                )

            if not isinstance(role_data, dict):
                raise PolicySchemaError(
                    f"agents.{agent_name}.roles.{role} must be a mapping"
                )

            role_tools = role_data.get("tools", {})
            if not isinstance(role_tools, dict):
                raise PolicySchemaError(
                    f"agents.{agent_name}.roles.{role}.tools must be a mapping"
                )

            for tool, rule in role_tools.items():
                if tool not in agent["tools"]:
                    raise PolicySchemaError(
                        f"Tool {tool} is not declared in agents.{agent_name}.tools"
                    )

                _validate_tool_rule(
                    rule,
                    f"agents.{agent_name}.roles.{role}.tools.{tool}",
                )

            secrets = role_data.get("secrets")
            if secrets not in _ALLOWED_SECRET_DECISIONS:
                raise PolicySchemaError(
                    f"Unsupported secrets policy for "
                    f"agents.{agent_name}.roles.{role}: {secrets}"
                )

        forbidden_actions = agent.get("forbidden_actions", [])
        _require_string_list(
            forbidden_actions,
            f"agents.{agent_name}.forbidden_actions",
        )

    return data


class PolicyStore:
    """Потокобезопасное хранилище и hot-reload политики."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._content: dict[str, Any] = {}
        self._version = 0
        self._raw_yaml = ""
        self.load_from_file()

    @staticmethod
    def parse(raw_yaml: str) -> dict[str, Any]:
        try:
            data = yaml.safe_load(raw_yaml)
        except yaml.YAMLError as exc:
            raise PolicyYAMLError(str(exc)) from exc

        return validate_policy(data)

    def load_from_file(self) -> None:
        path = Path(get_settings().POLICY_FILE)
        raw = path.read_text(encoding="utf-8")
        self.apply(raw)

    def apply(self, raw_yaml: str) -> int:
        data = self.parse(raw_yaml)
        version = data["version"]

        with self._lock:
            self._content = data
            self._version = version
            self._raw_yaml = raw_yaml

        return version

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    @property
    def raw_yaml(self) -> str:
        with self._lock:
            return self._raw_yaml

    @property
    def content(self) -> dict[str, Any]:
        with self._lock:
            return self._content.copy()

    def get_agent(self, agent: str) -> dict[str, Any]:
        with self._lock:
            agents = self._content.get("agents", {})
            config = agents.get(agent)

            if config is None:
                raise KeyError(f"Unknown policy agent: {agent}")

            return config

    def get_tool_decision(
        self,
        agent: str,
        role: str,
        tool: str,
        environment: str,
    ) -> str:
        agent_config = self.get_agent(agent)

        if role not in _ALLOWED_ROLES:
            return "deny"

        role_config = agent_config.get("roles", {}).get(role)
        if role_config is None:
            return "deny"

        rule = role_config.get("tools", {}).get(tool, "deny")

        if isinstance(rule, str):
            if rule == "any":
                return "allow"
            if rule == "nonprod":
                return "allow" if environment != "prod" else "deny"
            if rule == "prod":
                return "allow" if environment == "prod" else "deny"
            return rule

        if not isinstance(rule, dict):
            return "deny"

        return rule.get(environment, rule.get("any", "deny"))

    def get_secret_decision(self, agent: str, role: str) -> str:
        agent_config = self.get_agent(agent)

        if role not in _ALLOWED_ROLES:
            return "deny"

        role_config = agent_config.get("roles", {}).get(role)
        if role_config is None:
            return "deny"

        return role_config.get("secrets", "deny")


policy_store = PolicyStore()
