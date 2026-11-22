import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Loader2, MessageSquare, Plus, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { createSession, getSessions } from '../services/api';
const ROLE_CLASS = {
    admin: 'bg-blue-100 text-blue-800',
    sre: 'bg-green-100 text-green-800',
    developer: 'bg-orange-100 text-orange-800',
};
const fieldClass = 'px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
function shortId(id) {
    return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}
function fmtDate(iso) {
    return new Date(iso).toLocaleString('ru-RU');
}
function countClass(count, max) {
    if (max <= 0)
        return 'text-gray-800 dark:text-gray-100';
    const ratio = count / max;
    if (ratio >= 0.8)
        return 'text-red-600 font-medium';
    if (ratio >= 0.5)
        return 'text-yellow-600 font-medium';
    return 'text-gray-800 dark:text-gray-100';
}
export default function SessionsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['sessions'],
        queryFn: () => getSessions(),
        staleTime: 30_000,
        refetchOnMount: 'always',
    });
    const items = data?.items ?? [];
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 mb-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white", children: "\u0421\u0435\u0441\u0441\u0438\u0438 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u0432" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-0.5", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A \u0441 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435\u043C \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430" })] }), _jsxs("button", { type: "button", onClick: () => setOpen(true), className: "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm cursor-pointer", children: [_jsx(Plus, { className: "w-4 h-4" }), "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F"] })] }), isLoading && (_jsxs("div", { className: "flex items-center gap-2 text-gray-500 dark:text-gray-400 py-8", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin" }), "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0441\u0435\u0441\u0441\u0438\u0439\u2026"] })), isError && (_jsxs("div", { className: "flex items-center gap-2 text-red-600 py-4", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-red-500" }), "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u0438"] })), data && items.length === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500", children: [_jsx(MessageSquare, { className: "w-16 h-16 text-gray-300 dark:text-slate-500" }), _jsx("p", { className: "mt-3 text-sm", children: "\u041D\u0435\u0442 \u0441\u0435\u0441\u0441\u0438\u0439. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u0443\u044E!" })] })), items.length > 0 && (_jsx("div", { className: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[760px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 text-sm font-medium", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3", children: "Session ID" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0420\u043E\u043B\u044C" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0417\u0430\u043F\u0440\u043E\u0441\u043E\u0432" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0423\u0433\u0440\u043E\u0437\u044B" })] }) }), _jsx("tbody", { children: items.map((item) => (_jsx(SessionRow, { item: item, onOpen: () => navigate(`/sessions/${item.session_id}`) }, item.session_id))) })] }) }) })), open && (_jsx(CreateSessionModal, { onClose: () => setOpen(false), onCreated: () => {
                    setOpen(false);
                    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
                } }))] }));
}
function SessionRow({ item, onOpen }) {
    const role = item.user_role ?? '';
    return (_jsxs("tr", { onClick: onOpen, className: "border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer", children: [_jsx("td", { className: "px-4 py-2.5 font-mono text-gray-800 dark:text-gray-100", children: shortId(item.session_id) }), _jsx("td", { className: "px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300", children: fmtDate(item.created_at) }), _jsx("td", { className: "px-4 py-2.5", children: role ? (_jsx("span", { className: `inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASS[role] ?? 'bg-gray-100 text-gray-700 dark:text-gray-200'}`, children: role })) : (_jsx("span", { className: "text-gray-400 dark:text-gray-500", children: "\u2014" })) }), _jsxs("td", { className: `px-4 py-2.5 ${countClass(item.request_count, item.max_requests)}`, children: [item.request_count, "/", item.max_requests] }), _jsx("td", { className: "px-4 py-2.5", children: _jsx(StatusBadge, { status: item.status }) }), _jsx("td", { className: "px-4 py-2.5", children: item.threat_flags.length > 0 ? (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium", children: [_jsx(AlertTriangle, { className: "w-3.5 h-3.5" }), item.threat_flags.length] })) : (_jsx("span", { className: "text-gray-400 dark:text-gray-500", children: "\u2014" })) })] }));
}
function StatusBadge({ status }) {
    const active = status === 'active';
    return (_jsx("span", { className: `inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600 dark:text-gray-300'}`, children: active ? 'Активна' : 'Закрыта' }));
}
function CreateSessionModal({ onClose, onCreated, }) {
    const [role, setRole] = useState('admin');
    const [maxRequests, setMaxRequests] = useState(100);
    const create = useMutation({
        mutationFn: createSession,
        onSuccess: (session) => {
            toast.success(`Сессия создана: ${session.session_id}`);
            onCreated();
        },
        onError: () => toast.error('Не удалось создать сессию'),
    });
    function submit(e) {
        e.preventDefault();
        const max = Math.min(1000, Math.max(1, Math.trunc(maxRequests) || 1));
        create.mutate({
            user_id: localStorage.getItem('guard_user_id'),
            user_role: role,
            max_requests: max,
            metadata: null,
        });
    }
    return (_jsxs("div", { className: "fixed inset-0 z-40 flex items-center justify-center p-4", children: [_jsx("button", { type: "button", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", className: "absolute inset-0 bg-black/40 cursor-pointer", onClick: onClose }), _jsxs("form", { onSubmit: submit, className: "relative w-full max-w-md bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 p-5", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F" }), _jsx("button", { type: "button", onClick: onClose, className: "p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { className: "w-5 h-5" }) })] }), _jsxs("label", { className: "flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 mb-3", children: ["\u0420\u043E\u043B\u044C", _jsxs("select", { className: `${fieldClass} cursor-pointer`, value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "developer", children: "developer" }), _jsx("option", { value: "sre", children: "sre" }), _jsx("option", { value: "admin", children: "admin" })] })] }), _jsxs("label", { className: "flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 mb-5", children: ["\u041B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432", _jsx("input", { type: "number", min: 1, max: 1000, value: maxRequests, onChange: (e) => setMaxRequests(Number(e.target.value)), className: fieldClass })] }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: onClose, disabled: create.isPending, className: "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 text-sm cursor-pointer disabled:cursor-not-allowed", children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsxs("button", { type: "submit", disabled: create.isPending, className: "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed", children: [create.isPending && _jsx(Loader2, { className: "w-4 h-4 animate-spin" }), "\u0421\u043E\u0437\u0434\u0430\u0442\u044C"] })] })] })] }));
}
