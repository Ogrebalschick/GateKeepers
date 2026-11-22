import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DecisionBadge, RiskBadge } from '../components';
import { getSessionById } from '../services/api';
const ROLE_CLASS = {
    admin: 'bg-blue-100 text-blue-800',
    sre: 'bg-green-100 text-green-800',
    developer: 'bg-orange-100 text-orange-800',
};
function shortId(id) {
    return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}
function fmtDate(iso) {
    return new Date(iso).toLocaleString('ru-RU');
}
function clip(text, max = 300) {
    return text.length > max ? `${text.slice(0, max)}...` : text;
}
export default function SessionDetailPage() {
    const { sessionId = '' } = useParams();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['session', sessionId],
        queryFn: () => getSessionById(sessionId),
        enabled: sessionId.length > 0,
        staleTime: 30_000,
        refetchOnMount: 'always',
    });
    const messages = [...(data?.messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return (_jsxs("div", { children: [_jsxs(Link, { to: "/sessions", className: "inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-4 cursor-pointer", children: [_jsx(ArrowLeft, { className: "w-4 h-4" }), "\u041D\u0430\u0437\u0430\u0434 \u043A \u0441\u0435\u0441\u0441\u0438\u044F\u043C"] }), isLoading && (_jsxs("div", { className: "flex items-center gap-2 text-gray-500 dark:text-gray-400 py-8", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin" }), "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0435\u0441\u0441\u0438\u0438\u2026"] })), isError && (_jsxs("div", { className: "flex items-center gap-2 text-red-600 py-4", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-red-500" }), "\u0421\u0435\u0441\u0441\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430"] })), data && (_jsxs(_Fragment, { children: [_jsxs("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white mb-3", children: ["\u0421\u0435\u0441\u0441\u0438\u044F ", shortId(data.session_id)] }), _jsxs("div", { className: "flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-700 dark:text-gray-200", children: [_jsx(StatusBadge, { status: data.status }), _jsx(RoleBadge, { role: data.user_role }), _jsxs("span", { children: [data.request_count, "/", data.max_requests, " \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432"] }), _jsxs("span", { className: "text-gray-500 dark:text-gray-400", children: ["\u0421\u043E\u0437\u0434\u0430\u043D\u0430: ", fmtDate(data.created_at)] })] }), messages.length === 0 ? (_jsx("p", { className: "text-sm text-gray-400 dark:text-gray-500", children: "\u0412 \u044D\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A" })) : (messages.map((message, index) => (_jsx(MessageCard, { message: message, index: index }, message.check_id))))] }))] }));
}
function MessageCard({ message, index }) {
    return (_jsxs("article", { className: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4 mb-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-3", children: [_jsxs("span", { className: "text-xs text-gray-400 dark:text-gray-500", children: ["#", index + 1] }), _jsx(DecisionBadge, { decision: message.decision, size: "md" }), _jsx(RiskBadge, { riskLevel: message.risk_level, size: "md" }), message.is_multi_step_attack && (_jsxs("div", { className: "w-full bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2 text-sm font-medium", children: [_jsx(AlertTriangle, { className: "w-4 h-4 shrink-0" }), "\u041C\u043D\u043E\u0433\u043E\u0448\u0430\u0433\u043E\u0432\u0430\u044F \u0430\u0442\u0430\u043A\u0430 \u043E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u0430"] })), _jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400 ml-auto", children: fmtDate(message.created_at) })] }), _jsx("pre", { className: "font-mono text-sm whitespace-pre-wrap bg-gray-50 dark:bg-slate-900 rounded-lg p-3 text-gray-800 dark:text-gray-100", children: clip(message.user_prompt) }), _jsx("p", { className: "mt-3 text-sm text-gray-600 dark:text-gray-300", children: message.explanation }), _jsxs("p", { className: "mt-2 text-xs text-gray-400 dark:text-gray-500", children: [message.latency_ms, " \u043C\u0441 \u00B7 ", message.risk_category] })] }));
}
function StatusBadge({ status }) {
    const active = status === 'active';
    return (_jsx("span", { className: `inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600 dark:text-gray-300'}`, children: active ? 'Активна' : 'Закрыта' }));
}
function RoleBadge({ role }) {
    if (!role)
        return _jsx("span", { className: "text-gray-400 dark:text-gray-500", children: "\u2014" });
    return (_jsx("span", { className: `inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASS[role] ?? 'bg-gray-100 text-gray-700 dark:text-gray-200'}`, children: role }));
}
