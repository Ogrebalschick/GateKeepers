import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { DecisionBadge, RiskBadge } from '../components';
import LogDetailDrawer from '../components/LogDetailDrawer';
import LogFilters from '../components/LogFilters';
import { confirmAction, exportLogs, getLogById, getLogs } from '../services/api';
const EMPTY = {
    decision: '',
    risk_level: '',
    risk_category: '',
    user_id: '',
    user_name: '',
    search: '',
    date_from: '',
    date_to: '',
    page: 1,
    per_page: 5,
};
const ROLE_CLASS = {
    admin: 'bg-blue-100 text-blue-800',
    sre: 'bg-green-100 text-green-800',
    developer: 'bg-orange-100 text-orange-800',
};
function fmtTime(iso) {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}
function clip(text, max = 80) {
    return text.length > max ? `${text.slice(0, max)}...` : text;
}
export default function LogsPage() {
    const queryClient = useQueryClient();
    const [filters, setFilters] = useState(EMPTY);
    const [selectedId, setSelectedId] = useState(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['logs', filters],
        queryFn: () => getLogs({
            decision: filters.decision || undefined,
            risk_level: filters.risk_level || undefined,
            risk_category: filters.risk_category || undefined,
            user_id: filters.user_id || undefined,
            search: filters.search || undefined,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            page: filters.page,
            per_page: filters.per_page,
        }),
        staleTime: 30_000,
        refetchOnMount: 'always',
    });
    const { data: detail, isLoading: detailLoading } = useQuery({
        queryKey: ['log', selectedId],
        queryFn: () => getLogById(selectedId),
        enabled: selectedId != null,
    });
    async function handleDecision(decision) {
        if (!detail?.check_id)
            return;
        setConfirmLoading(true);
        try {
            await confirmAction({
                check_id: detail.check_id,
                user_decision: decision,
                user_id: localStorage.getItem('guard_user_id') ?? '',
                comment: null,
            });
            void queryClient.invalidateQueries({ queryKey: ['logs'] });
            void queryClient.invalidateQueries({ queryKey: ['log'] });
            toast.success(decision === 'approved' ? 'Действие подтверждено' : 'Действие отклонено');
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 409)
                toast.error('Уже подтверждено');
            else if (status === 404)
                toast.error('Проверка не найдена');
            else if (status !== 401)
                toast.error('Ошибка подтверждения');
        }
        finally {
            setConfirmLoading(false);
        }
    }
    function patch(partial) {
        setFilters((prev) => ({ ...prev, ...partial, page: partial.page ?? 1 }));
    }
    async function exportCsv() {
        try {
            const blob = await exportLogs({
                decision: filters.decision || undefined,
                risk_level: filters.risk_level || undefined,
                risk_category: filters.risk_category || undefined,
                user_id: filters.user_id || undefined,
                search: filters.search || undefined,
                date_from: filters.date_from || undefined,
                date_to: filters.date_to || undefined,
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
        catch (error) {
            console.error('Export failed:', error);
            toast.error('Не удалось экспортировать журнал');
        }
    }
    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const page = data?.page ?? filters.page;
    const perPage = data?.per_page ?? filters.per_page;
    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(page * perPage, total);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3 mb-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white", children: "\u0416\u0443\u0440\u043D\u0430\u043B \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A" }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-0.5", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0432\u0441\u0435\u0445 \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A \u0437\u0430\u043F\u0440\u043E\u0441\u043E\u0432 \u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436\u0435\u043C" })] }), _jsxs("button", { type: "button", onClick: exportCsv, className: "bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm cursor-pointer", children: [_jsx(Download, { className: "w-4 h-4" }), "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 CSV"] })] }), _jsx(LogFilters, { values: filters, onChange: (next) => patch(next), onReset: () => {
                    setSelectedId(null);
                    setFilters(EMPTY);
                } }), filters.user_id && (_jsxs("div", { className: "bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md mb-4 flex items-center gap-2 w-fit", children: [_jsxs("span", { className: "text-sm", children: ["\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u0437\u0430\u043F\u0440\u043E\u0441\u044B: ", filters.user_name] }), _jsx("button", { type: "button", "aria-label": "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0444\u0438\u043B\u044C\u0442\u0440 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", onClick: () => patch({ user_id: '', user_name: '' }), className: "hover:text-red-600 cursor-pointer", children: _jsx(X, { className: "w-4 h-4" }) })] })), isError ? (_jsxs("div", { className: "flex items-center gap-2 text-red-600 text-sm", children: [_jsx(AlertCircle, { className: "w-5 h-5 text-red-500" }), "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0436\u0443\u0440\u043D\u0430\u043B"] })) : isLoading ? (_jsxs("div", { className: "flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-8", children: [_jsx(Loader2, { className: "w-6 h-6 animate-spin" }), "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0436\u0443\u0440\u043D\u0430\u043B\u0430\u2026"] })) : (_jsx("div", { className: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden", children: _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { id: "tour-logs-table", className: "w-full text-sm min-w-[880px]", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 text-sm font-medium text-left", children: [_jsx("th", { className: "px-4 py-2.5", children: "\u0412\u0440\u0435\u043C\u044F" }), _jsx("th", { className: "px-4 py-2.5", children: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C" }), _jsx("th", { className: "px-4 py-2.5", children: "\u0417\u0430\u043F\u0440\u043E\u0441" }), _jsx("th", { className: "px-4 py-2.5", children: "\u0420\u0435\u0448\u0435\u043D\u0438\u0435" }), _jsx("th", { className: "px-4 py-2.5", children: "\u0420\u0438\u0441\u043A" }), _jsx("th", { className: "px-4 py-2.5", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { className: "px-4 py-2.5 text-right", children: "\u0417\u0430\u0434\u0435\u0440\u0436\u043A\u0430" }), _jsx("th", { className: "px-4 py-2.5", children: "\u0421\u043B\u043E\u0439" })] }) }), _jsx("tbody", { children: items.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-8 text-center text-gray-400 dark:text-gray-500", children: "\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E" }) })) : (items.map((item) => (_jsx(LogRow, { item: item, onOpen: () => setSelectedId(item.id), onUser: () => patch({ user_id: item.user_id, user_name: item.user_name, page: 1 }) }, item.id)))) })] }) }) })), _jsxs("div", { className: "flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-gray-300", children: [_jsxs("span", { children: ["\u0417\u0430\u043F\u0438\u0441\u044C ", from, "\u2013", to, " \u0438\u0437 ", total] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", disabled: page <= 1 || isLoading, onClick: () => patch({ page: page - 1 }), className: "px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed", children: "\u2039 \u041D\u0430\u0437\u0430\u0434" }), _jsx("button", { type: "button", disabled: !data || page >= data.pages || isLoading, onClick: () => patch({ page: page + 1 }), className: "px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed", children: "\u0414\u0430\u043B\u0435\u0435 \u203A" })] })] }), _jsx(LogDetailDrawer, { open: selectedId != null, loading: detailLoading, detail: detail ?? null, confirmLoading: confirmLoading, onConfirm: () => handleDecision('approved'), onReject: () => handleDecision('rejected'), onClose: () => setSelectedId(null) })] }));
}
function LogRow({ item, onOpen, onUser, }) {
    return (_jsxs("tr", { onClick: onOpen, className: "border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer", children: [_jsx("td", { className: "px-4 py-2.5 whitespace-nowrap text-gray-500 dark:text-gray-400", children: fmtTime(item.created_at) }), _jsxs("td", { className: "px-4 py-2.5", children: [_jsx("button", { type: "button", onClick: (e) => {
                            e.stopPropagation();
                            onUser();
                        }, className: "text-blue-600 hover:text-blue-800 hover:underline cursor-pointer", children: item.user_name }), _jsx("span", { className: `ml-2 inline-flex px-2 py-0.5 rounded text-xs ${ROLE_CLASS[item.user_role] ?? 'bg-gray-100 text-gray-700 dark:text-gray-200'}`, children: item.user_role })] }), _jsx("td", { className: "px-4 py-2.5 text-gray-800 dark:text-gray-100 max-w-xs", children: clip(item.user_prompt) }), _jsx("td", { className: "px-4 py-2.5", children: _jsx(DecisionBadge, { decision: item.decision, size: "sm" }) }), _jsx("td", { className: "px-4 py-2.5", children: _jsx(RiskBadge, { riskLevel: item.risk_level, size: "sm" }) }), _jsx("td", { className: "px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300", children: item.risk_category }), _jsx("td", { className: "px-4 py-2.5 text-right text-gray-500 dark:text-gray-400", children: item.latency_ms }), _jsx("td", { className: "px-4 py-2.5 text-gray-500 dark:text-gray-400", children: item.pipeline_layer })] }));
}
