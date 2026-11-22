/**
 * src/services/api.ts
 *
 * Two Axios instances, both with an empty baseURL.
 * Nginx inside the frontend container routes by path:
 *   /api/* and /auth/* → backend
 *   /v1/*              → ml-service
 *   apiClient carries Bearer only for /api/*
 *   mlClient (POST /v1/check) stays unauthenticated for evaluate.py
 */
import axios from 'axios';
import toast from 'react-hot-toast';
// =============================================================================
// Storage & utilities
// =============================================================================
const GUARD_KEYS = ['guard_token', 'guard_user_id', 'guard_role', 'guard_username'];
/** Returns Authorization header object, or {} when not logged in. */
export function getAuthHeaders() {
    const token = localStorage.getItem('guard_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Clear session and return to the public home page. */
export function logout() {
    GUARD_KEYS.forEach((k) => localStorage.removeItem(k));
    window.location.href = '/';
}
function clearSession() {
    GUARD_KEYS.forEach((k) => localStorage.removeItem(k));
}
// =============================================================================
// Axios instances
// =============================================================================
// ─── apiClient — /api/* and /auth/* (Bearer only on /api/) ───────────────────
const apiClient = axios.create({
    baseURL: '',
    headers: { 'Content-Type': 'application/json' },
});
apiClient.interceptors.request.use((config) => {
    const url = config.url ?? '';
    const token = localStorage.getItem('guard_token');
    if (token && url.includes('/api/')) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
// ─── mlClient — /v1/* (no auth — evaluate.py compatible) ─────────────────────
const mlClient = axios.create({
    baseURL: '',
    headers: { 'Content-Type': 'application/json' },
});
// ─── Shared response error interceptor ───────────────────────────────────────
function attachResponseInterceptor(client) {
    client.interceptors.response.use((response) => response, (error) => {
        const status = error?.response?.status;
        const url = error?.config?.url ?? '';
        if (status === 401 && !url.includes('/auth/')) {
            clearSession();
            window.location.href = '/login';
        }
        else if (status === 403) {
            toast.error('Недостаточно прав для этой операции');
        }
        return Promise.reject(error);
    });
}
attachResponseInterceptor(apiClient);
attachResponseInterceptor(mlClient);
// =============================================================================
// API functions
// =============================================================================
// ─── POST /auth/login ─────────────────────────────────────────────────────────
export async function login(username, password) {
    return apiClient.post('/auth/login', { username, password }).then((r) => r.data);
}
// ─── POST /v1/check ───────────────────────────────────────────────────────────
/** No auth — evaluate.py calls this without a token. */
export async function checkPrompt(payload) {
    const hasToken = Boolean(localStorage.getItem('guard_token'));
    const userId = hasToken
        ? localStorage.getItem('guard_user_id') || payload.context.user_id || 'demo-user'
        : 'demo-user';
    const userRole = hasToken
        ? localStorage.getItem('guard_role') || payload.context.user_role || 'guest'
        : 'guest';
    const body = {
        user_prompt: payload.user_prompt,
        session_id: payload.session_id,
        context: {
            target_agent: payload.context.target_agent,
            user_role: userRole,
            user_id: userId,
            user_name: payload.context.user_name,
            system_prompt: payload.context.system_prompt,
            history: payload.context.history,
            attachments: payload.context.attachments,
        },
    };
    return mlClient.post('/v1/check', body).then((r) => r.data);
}
// ─── GET /api/logs ────────────────────────────────────────────────────────────
export async function getLogs(params) {
    return apiClient.get('/api/logs', { params }).then((r) => r.data);
}
// ─── GET /api/logs/{id} ───────────────────────────────────────────────────────
export async function getLogById(id) {
    return apiClient.get(`/api/logs/${id}`).then((r) => r.data);
}
// ─── GET /api/logs/export.csv ─────────────────────────────────────────────────
export async function exportLogs(params) {
    return apiClient
        .get('/api/logs/export.csv', { params, responseType: 'blob' })
        .then((r) => r.data);
}
// ─── GET /api/policy ──────────────────────────────────────────────────────────
export async function getPolicy() {
    return apiClient.get('/api/policy').then((r) => r.data);
}
// ─── PUT /api/policy ──────────────────────────────────────────────────────────
export async function updatePolicy(data) {
    return apiClient.put('/api/policy', data).then((r) => r.data);
}
// ─── GET /api/policy/history ──────────────────────────────────────────────────
export async function getPolicyHistory() {
    return apiClient.get('/api/policy/history').then((r) => r.data);
}
// ─── POST /api/confirm ────────────────────────────────────────────────────────
export async function confirmAction(data) {
    return apiClient.post('/api/confirm', data).then((r) => r.data);
}
// ─── POST /api/sessions ───────────────────────────────────────────────────────
export async function createSession(data) {
    return apiClient.post('/api/sessions', data).then((r) => r.data);
}
// ─── GET /api/sessions ────────────────────────────────────────────────────────
export async function getSessions(params) {
    return apiClient.get('/api/sessions', { params }).then((r) => r.data);
}
// ─── GET /api/sessions/{id} ───────────────────────────────────────────────────
export async function getSessionById(id) {
    return apiClient.get(`/api/sessions/${id}`).then((r) => r.data);
}
// ─── GET /api/stats ───────────────────────────────────────────────────────────
export async function getStats(periodHours) {
    const hours = typeof periodHours === 'number' ? periodHours : undefined;
    return apiClient
        .get('/api/stats', {
        params: hours ? { period_hours: hours } : undefined,
    })
        .then((r) => r.data);
}
// ─── GET /api/stats/timeline ──────────────────────────────────────────────────
export async function getTimeline(hours) {
    return apiClient
        .get('/api/stats/timeline', { params: { hours } })
        .then((r) => r.data);
}
// =============================================================================
// Exports
// =============================================================================
export { apiClient, mlClient };
export default apiClient;
