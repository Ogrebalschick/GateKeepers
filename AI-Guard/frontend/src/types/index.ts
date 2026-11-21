// =============================================================================
// src/types/index.ts — все TypeScript-типы проекта ИИ-Сторож
// Соответствует api-contract.md
// =============================================================================

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'sre' | 'developer';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
  role: UserRole;
}

export interface ApiError {
  error: string;
  detail: string;
}

// ─── Common primitives ────────────────────────────────────────────────────────

export type Decision = 'allow' | 'confirm' | 'block';
export type ConfirmStatus = 'pending' | 'approved' | 'rejected';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type RiskCategory =
  | 'none'
  | 'sensitive_action'
  | 'unauthorized_data_access'
  | 'tool_abuse'
  | 'prompt_injection'
  | 'jailbreak'
  | 'indirect_injection'
  | 'system_prompt_extraction'
  | 'system_prompt_override'
  | 'privilege_escalation'
  | 'data_exfiltration'
  | 'harmful_content'
  | 'fraud_social_engineering'
  | 'abuse'
  | string; // allow unknown categories from real API

// ─── POST /v1/check ───────────────────────────────────────────────────────────

export interface CheckContextMessage {
  role: string;
  content: string;
}

export interface CheckContextAttachment {
  type: string;
  name: string;
  content: string;
}

export interface CheckContext {
  target_agent: string;
  user_role: string;
  user_id: string;
  user_name: string;
  system_prompt: string;
  history: CheckContextMessage[];
  attachments: CheckContextAttachment[];
}

export interface CheckRequest {
  user_prompt: string;
  context: CheckContext;
  session_id: string | null;
}

export interface CheckResponse {
  decision: Decision;
  risk_level: RiskLevel;
  risk_category: RiskCategory;
  explanation: string;
  latency_ms: number;
  pipeline_layer: string;
  check_id: string;
  is_multi_step_attack?: boolean;
}

// ─── GET /api/logs ────────────────────────────────────────────────────────────

export interface LogItem {
  id: number;
  check_id: string;
  created_at: string;
  user_prompt: string;
  user_role: string;
  user_id: string;
  user_name: string;
  decision: Decision;
  risk_level: RiskLevel;
  risk_category: RiskCategory;
  explanation: string;
  latency_ms: number;
  pipeline_layer: string;
  has_attachments: boolean;
  session_id: string | null;
  policy_version: number;
  confirm_status?: ConfirmStatus;
}

export interface LogsResponse {
  items: LogItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface LogsParams {
  decision?: Decision | '';
  risk_level?: RiskLevel | '';
  risk_category?: string;
  user_id?: string;
  user_role?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

// ─── GET /api/logs/{id} ───────────────────────────────────────────────────────

export interface LogDetailContext {
  target_agent: string;
  user_role: string;
  user_id: string;
  user_name: string;
  history_count: number;
  attachments_count: number;
  attachments: Array<{
    type: string;
    name: string;
    content_preview: string;
  }>;
}

export interface LogDetail {
  id: number;
  check_id: string;
  created_at: string;
  user_prompt: string;
  context: LogDetailContext;
  decision: Decision;
  risk_level: RiskLevel;
  risk_category: RiskCategory;
  explanation: string;
  latency_ms: number;
  pipeline_layer: string;
  policy_version: number;
  session_id: string | null;
  confirm_status?: ConfirmStatus;
}

// ─── GET /api/policy ──────────────────────────────────────────────────────────

export interface PolicyVersion {
  version: number;
  content_yaml: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  comment: string | null;
}

// ─── PUT /api/policy ──────────────────────────────────────────────────────────

export interface PolicyUpdateRequest {
  content_yaml: string;
  comment: string | null;
  updated_by: string;
}

export interface PolicyUpdateResponse {
  version: number;
  content_yaml: string;
  updated_at: string;
  updated_by: string;
  comment: string | null;
  reload_status: 'ok' | 'failed';
}

// ─── GET /api/policy/history ──────────────────────────────────────────────────

export interface PolicyHistoryItem {
  version: number;
  updated_at: string;
  updated_by: string;
  comment: string | null;
  is_active: boolean;
}

export interface PolicyHistoryResponse {
  items: PolicyHistoryItem[];
}

// ─── POST /api/confirm ────────────────────────────────────────────────────────

export type UserDecision = 'approved' | 'rejected';

export interface ConfirmRequest {
  check_id: string;
  user_decision: UserDecision;
  user_id: string;
  comment: string | null;
}

export interface ConfirmResponse {
  check_id: string;
  user_decision: UserDecision;
  confirmed_at: string;
  confirmed_by: string;
}

// ─── POST /api/sessions ───────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'closed';

export interface SessionCreateRequest {
  user_id: string | null;
  user_role: string | null;
  max_requests: number | null;
  metadata: Record<string, unknown> | null;
}

export interface Session {
  session_id: string;
  created_at: string;
  user_id: string | null;
  user_role: string | null;
  max_requests: number;
  request_count: number;
  status: SessionStatus;
  last_activity_at: string;
  threat_flags: string[];
}

// ─── GET /api/sessions ────────────────────────────────────────────────────────

export interface SessionsParams {
  status?: SessionStatus | '';
  user_id?: string;
  page?: number;
  per_page?: number;
}

export interface SessionsResponse {
  items: Session[];
  total: number;
  page: number;
  per_page: number;
}

// ─── GET /api/sessions/{id} ───────────────────────────────────────────────────

export interface SessionMessage {
  id: number;
  check_id: string;
  created_at: string;
  user_prompt: string;
  decision: Decision;
  risk_level: RiskLevel;
  risk_category: RiskCategory;
  explanation: string;
  latency_ms: number;
  is_multi_step_attack: boolean;
}

export interface SessionDetail extends Session {
  messages: SessionMessage[];
}

// ─── GET /api/stats ───────────────────────────────────────────────────────────

export interface StatsResponse {
  total_checks: number;
  by_decision: Record<Decision, number>;
  by_risk_level: Record<RiskLevel, number>;
  top_categories: Array<{ category: string; count: number }>;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  by_pipeline_layer: Record<string, number>;
  period_hours: number;
}

// ─── GET /api/stats/timeline ──────────────────────────────────────────────────

export interface TimelineItem {
  hour: string;
  allow: number;
  confirm: number;
  block: number;
  total: number;
  avg_latency_ms: number;
}

export interface TimelineResponse {
  items: TimelineItem[];
}
