import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Pencil, Save, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { getPolicy, getPolicyHistory, updatePolicy } from '../services/api';
function fmtDate(iso) {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
function readApiError(err) {
    if (err && typeof err === 'object' && 'response' in err) {
        const response = err
            .response;
        return {
            status: response?.status,
            detail: response?.data?.detail ?? 'Неизвестная ошибка',
        };
    }
    return { detail: err instanceof Error ? err.message : 'Неизвестная ошибка' };
}
export default function PolicyPage() {
    const queryClient = useQueryClient();
    const role = localStorage.getItem('guard_role');
    const userId = localStorage.getItem('guard_user_id') ?? '';
    const isAdmin = role === 'admin';
    const [tab, setTab] = useState('current');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [comment, setComment] = useState('');
    const [errorBanner, setErrorBanner] = useState(null);
    const { data: policy, isLoading, isError, } = useQuery({
        queryKey: ['policy'],
        queryFn: getPolicy,
        staleTime: 30_000,
    });
    const { data: history, isLoading: historyLoading, isError: historyError, } = useQuery({
        queryKey: ['policy-history'],
        queryFn: getPolicyHistory,
        enabled: tab === 'history',
        staleTime: 30_000,
    });
    const save = useMutation({
        mutationFn: updatePolicy,
        onSuccess: (res) => {
            const next = {
                version: res.version,
                content_yaml: res.content_yaml,
                created_at: policy?.created_at ?? res.updated_at,
                updated_at: res.updated_at,
                updated_by: res.updated_by,
                comment: res.comment,
            };
            queryClient.setQueryData(['policy'], next);
            void queryClient.invalidateQueries({ queryKey: ['policy'] });
            void queryClient.invalidateQueries({ queryKey: ['policy-history'] });
            setDraft(res.content_yaml);
            setComment('');
            setErrorBanner(null);
            setEditing(false);
            if (res.reload_status === 'ok') {
                toast.success(`Политика обновлена, версия ${res.version}, ML перезагружен`);
            }
            else {
                toast.error(`Политика сохранена (версия ${res.version}), но ML не перезагружен`);
            }
        },
        onError: (err) => {
            const { status, detail } = readApiError(err);
            if (status === 400)
                setErrorBanner(`Невалидный YAML: ${detail}`);
            else if (status === 422)
                setErrorBanner(`Схема политики нарушена: ${detail}`);
            else
                toast.error(detail);
        },
    });
    function startEdit() {
        if (!isAdmin || !policy)
            return;
        setDraft(policy.content_yaml);
        setComment('');
        setErrorBanner(null);
        setEditing(true);
    }
    function cancelEdit() {
        setDraft(policy?.content_yaml ?? '');
        setComment('');
        setErrorBanner(null);
        setEditing(false);
    }
    function submit() {
        setErrorBanner(null);
        save.mutate({
            content_yaml: draft,
            comment: comment.trim() ? comment.trim() : null,
            updated_by: userId,
        });
    }
    return (_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white", children: "\u041F\u043E\u043B\u0438\u0442\u0438\u043A\u0430 \u0431\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u043E\u0441\u0442\u0438" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-0.5 mb-4", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u0430\u043C\u0438 \u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436\u0430" }), _jsxs("div", { className: "bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 mb-4 flex gap-1", children: [_jsx(TabButton, { active: tab === 'current', onClick: () => setTab('current'), children: "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0430" }), _jsx(TabButton, { active: tab === 'history', onClick: () => setTab('history'), children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u0435\u0440\u0441\u0438\u0439" })] }), tab === 'current' && (_jsxs(_Fragment, { children: [isLoading && (_jsxs("div", { className: "flex items-center gap-2 text-gray-500 dark:text-gray-400 py-8", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin" }), "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0438\u2026"] })), isError && (_jsxs("div", { className: "flex items-center gap-2 text-red-600 py-4", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-red-500" }), "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0443"] })), policy && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-4 mb-4 flex flex-wrap gap-4", children: [_jsx(Meta, { label: "\u0412\u0435\u0440\u0441\u0438\u044F", children: _jsxs("span", { className: "inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800", children: ["v", policy.version] }) }), _jsx(Meta, { label: "\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E", children: fmtDate(policy.updated_at) }), _jsx(Meta, { label: "\u041A\u0435\u043C", children: policy.updated_by }), policy.comment && _jsx(Meta, { label: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439", children: policy.comment })] }), errorBanner && (_jsxs("div", { className: "mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700", children: [_jsx(AlertCircle, { className: "w-5 h-5 shrink-0 text-red-500" }), _jsx("span", { children: errorBanner })] })), _jsx("textarea", { value: editing ? draft : (policy.content_yaml ?? ''), onChange: (e) => setDraft(e.target.value), readOnly: !editing, spellCheck: false, "aria-label": "YAML \u043F\u043E\u043B\u0438\u0442\u0438\u043A\u0438", className: [
                                    'w-full h-96 font-mono text-sm rounded-lg p-4 resize-y',
                                    editing
                                        ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white border-2 border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none'
                                        : 'bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200',
                                ].join(' ') }), _jsxs("div", { className: "mt-4 flex flex-wrap items-end gap-3", children: [!editing && isAdmin && (_jsxs("button", { type: "button", onClick: startEdit, className: "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm cursor-pointer", children: [_jsx(Pencil, { className: "w-4 h-4" }), "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C"] })), !editing && !isAdmin && (_jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400", children: "\u0422\u043E\u043B\u044C\u043A\u043E admin \u043C\u043E\u0436\u0435\u0442 \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })), editing && (_jsxs(_Fragment, { children: [_jsxs("label", { className: "flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300 flex-1 min-w-[240px]", children: ["\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044E (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)", _jsx("input", { value: comment, onChange: (e) => setComment(e.target.value), className: "border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" })] }), _jsxs("button", { type: "button", onClick: submit, disabled: save.isPending, className: "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed", children: [save.isPending ? (_jsx(Loader2, { className: "w-4 h-4 animate-spin" })) : (_jsx(Save, { className: "w-4 h-4" })), "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] }), _jsxs("button", { type: "button", onClick: cancelEdit, disabled: save.isPending, className: "bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed", children: [_jsx(X, { className: "w-4 h-4" }), "\u041E\u0442\u043C\u0435\u043D\u0430"] })] }))] })] }))] })), tab === 'history' && (_jsxs(_Fragment, { children: [historyLoading && (_jsxs("div", { className: "flex items-center gap-2 text-gray-500 dark:text-gray-400 py-8", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin" }), "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0438\u0441\u0442\u043E\u0440\u0438\u0438\u2026"] })), historyError && (_jsxs("div", { className: "flex items-center gap-2 text-red-600 py-4", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-red-500" }), "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0440\u0438\u044E \u0432\u0435\u0440\u0441\u0438\u0439"] })), history && (_jsx("div", { className: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm min-w-[640px]", children: [_jsx("thead", { className: "bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 text-sm font-medium", children: _jsxs("tr", { children: [_jsx("th", { className: "text-left px-4 py-3", children: "\u0412\u0435\u0440\u0441\u0438\u044F" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0414\u0430\u0442\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u041A\u0435\u043C" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" }), _jsx("th", { className: "text-left px-4 py-3", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F" })] }) }), _jsx("tbody", { children: history.items.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-4 py-8 text-center text-gray-400 dark:text-gray-500", children: "\u0412\u0435\u0440\u0441\u0438\u0439 \u043D\u0435\u0442" }) })) : (history.items.map((item) => (_jsxs("tr", { className: item.is_active
                                                ? 'border-t border-gray-100 dark:border-slate-700 bg-blue-50 dark:bg-slate-700 font-medium'
                                                : 'border-t border-gray-100 dark:border-slate-700', children: [_jsxs("td", { className: "px-4 py-2.5", children: ["v", item.version] }), _jsx("td", { className: "px-4 py-2.5 whitespace-nowrap", children: fmtDate(item.updated_at) }), _jsx("td", { className: "px-4 py-2.5", children: item.updated_by }), _jsx("td", { className: "px-4 py-2.5 text-gray-600 dark:text-gray-300", children: item.comment ?? '—' }), _jsx("td", { className: "px-4 py-2.5", children: item.is_active ? (_jsx(Check, { className: "w-4 h-4 text-blue-600", "aria-label": "\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F" })) : (_jsx("span", { className: "text-gray-400 dark:text-gray-500", children: "\u2014" })) })] }, item.version)))) })] }) }) }))] }))] }));
}
function TabButton({ active, onClick, children, }) {
    return (_jsx("button", { type: "button", onClick: onClick, className: [
            'px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors cursor-pointer',
            active
                ? 'border-blue-500 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100',
        ].join(' '), children: children }));
}
function Meta({ label, children }) {
    return (_jsxs("div", { className: "text-sm", children: [_jsx("div", { className: "text-gray-500 dark:text-gray-400 text-xs mb-0.5", children: label }), _jsx("div", { className: "text-gray-900 dark:text-white", children: children })] }));
}
