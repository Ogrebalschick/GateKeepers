from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    role: str = "user"
    content: str = ""


class AttachmentItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str = "document"
    name: str = "attachment"
    content: str = ""


class CheckContext(BaseModel):
    model_config = ConfigDict(extra="allow")
    target_agent: str = "it_ops_agent"
    user_role: str = "unknown"
    user_id: str = ""
    user_name: str = ""
    system_prompt: str = ""
    history: list[HistoryItem] = Field(default_factory=list)
    attachments: list[AttachmentItem] = Field(default_factory=list)


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    user_prompt: str = Field(min_length=1)
    context: CheckContext = Field(default_factory=CheckContext)
    session_id: str | None = None


class CheckResponse(BaseModel):
    decision: str
    risk_level: str
    risk_category: str
    explanation: str
    latency_ms: float
    pipeline_layer: str
    check_id: str


class ReloadPolicyRequest(BaseModel):
    content_yaml: str = Field(min_length=1)
    version: int | None = None
