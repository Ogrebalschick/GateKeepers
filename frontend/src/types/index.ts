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

// ─── Logs ─────────────────────────────────────────────────────────────────────

export type Decision = 'allow' | 'confirm' | 'block';
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

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
  risk_category: string;
  explanation: string;
  latency_ms: number;
  pipeline_layer: string;
  has_attachments: boolean;
  session_id: string | null;
  policy_version: number;
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

// ─── Check (POST /v1/check) ───────────────────────────────────────────────────

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
  risk_category: string;
  explanation: string;
  latency_ms: number;
  pipeline_layer: string;
  check_id: string;
}
