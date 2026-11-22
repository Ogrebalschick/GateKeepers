
from typing import Literal, Optional

from pydantic import BaseModel, Field


Role = Literal["developer", "sre", "admin"]

# Решения, которые возвращает проверка запроса
Decision = Literal["allow", "confirm", "block"]

# Значения, используемые в policy.yaml
PolicyDecision = Literal[
    "allow",
    "confirm",
    "deny",
    "block",
    "any",
    "nonprod",
    "prod",
    "names_only",
]

RiskLevel = Literal["none", "low", "medium", "high", "critical"]

RiskCategory = Literal[
    "none",
    "sensitive_action",
    "tool_abuse",
    "unauthorized_data_access",
    "prompt_injection",
    "jailbreak",
    "indirect_injection",
    "system_prompt_extraction",
    "system_prompt_override",
    "privilege_escalation",
    "data_exfiltration",
    "harmful_content",
    "fraud_social_engineering",
    "abuse",
]


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = ""


class Attachment(BaseModel):
    type: str = "document"
    name: str = ""
    content: str = ""


class Context(BaseModel):
    target_agent: str = "it_ops_agent"
    user_role: Role = "developer"
    user_id: str = "u-anon"
    user_name: str = "Anonymous"
    system_prompt: str = ""
    history: list[HistoryTurn] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)


class CheckRequest(BaseModel):
    user_prompt: str = ""
    context: Context = Field(default_factory=Context)
    session_id: Optional[str] = None


class CheckResponse(BaseModel):
    decision: Decision
    risk_level: RiskLevel
    risk_category: RiskCategory
    explanation: str
    latency_ms: float
    pipeline_layer: str = "layer0"
    check_id: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str
    role: Role


class ConfirmRequest(BaseModel):
    check_id: str
    user_decision: Literal["approved", "rejected"]
    user_id: str
    comment: Optional[str] = None


class PolicyUpdateRequest(BaseModel):
    content_yaml: str
    comment: Optional[str] = None


class SessionCreateRequest(BaseModel):
    user_id: Optional[str] = None
    user_role: Optional[str] = None
    max_requests: Optional[int] = None
    metadata: Optional[dict] = None


DECISIONS = frozenset(Decision)
POLICY_DECISIONS = frozenset(PolicyDecision)
RISK_LEVELS = frozenset(RiskLevel)
RISK_CATEGORIES = frozenset(RiskCategory)
