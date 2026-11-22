import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle, Clock, ShieldX } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { getStats, getTimeline } from '../services/api';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
    return n.toLocaleString('ru-RU');
}
/** Format ISO hour string → "14:00" */
function fmtHour(iso) {
    try {
        return new Date(iso).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    }
    catch {
        return iso.slice(11, 16);
    }
}
function StatCard({ icon, label, value, valueClass = 'text-gray-900 dark:text-white', }) {
    return (_jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700 flex items-start gap-3", children: [_jsx("div", { className: "shrink-0 mt-0.5", children: icon }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: `text-2xl font-bold leading-tight ${valueClass}`, children: value }), _jsx("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight", children: label })] })] }));
}
// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
    return (_jsx("div", { className: "bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700 animate-pulse", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "w-6 h-6 rounded bg-gray-200 dark:bg-slate-700 shrink-0 mt-0.5" }), _jsxs("div", { className: "flex-1 space-y-2 pt-1", children: [_jsx("div", { className: "h-6 bg-gray-200 dark:bg-slate-700 rounded w-16" }), _jsx("div", { className: "h-3 bg-gray-100 dark:bg-slate-700 rounded w-24" })] })] }) }));
}
// ─── Custom tooltip for BarChart ──────────────────────────────────────────────
function CustomTooltip({ active, payload, label, }) {
    if (!active || !payload?.length)
        return null;
    return (_jsxs("div", { className: "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-sm", children: [_jsx("p", { className: "font-medium text-gray-700 dark:text-gray-200 mb-1", children: label }), payload.map((p) => (_jsxs("p", { style: { color: p.color }, children: [p.name, ": ", _jsx("span", { className: "font-semibold", children: fmt(p.value) })] }, p.name)))] }));
}
// ─── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { data: stats, isLoading: statsLoading, isError: statsError, } = useQuery({
        queryKey: ['stats'],
        queryFn: getStats,
        refetchInterval: 30_000,
        refetchOnMount: 'always',
    });
    const { data: timeline, isLoading: timelineLoading } = useQuery({
        queryKey: ['timeline'],
        queryFn: () => getTimeline(24),
        refetchInterval: 30_000,
        refetchOnMount: 'always',
    });
    // Prepare chart data
    const chartData = (timeline?.items ?? []).map((item) => ({
        hour: fmtHour(item.hour),
        Разрешено: item.allow,
        Подтвердить: item.confirm,
        Заблокировано: item.block,
    }));
    // Top categories sorted by count
    const topCategories = [...(stats?.top_categories ?? [])]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white", children: "\u0414\u0430\u0448\u0431\u043E\u0440\u0434" }), _jsx("p", { className: "text-gray-500 dark:text-gray-400 text-sm mt-0.5", children: "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0435 30 \u0441\u0435\u043A\u0443\u043D\u0434" })] }), statsError ? (_jsx("div", { className: "p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443" })) : (_jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4", children: statsLoading ? (Array.from({ length: 5 }).map((_, i) => _jsx(SkeletonCard, {}, i))) : stats ? (_jsxs(_Fragment, { children: [_jsx(StatCard, { icon: _jsx(Activity, { className: "w-6 h-6 text-blue-500" }), label: "\u0412\u0441\u0435\u0433\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u043E\u043A", value: fmt(stats.total_checks) }), _jsx(StatCard, { icon: _jsx(ShieldX, { className: "w-6 h-6 text-red-500" }), label: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E", value: fmt(stats.by_decision.block), valueClass: "text-red-600" }), _jsx(StatCard, { icon: _jsx(AlertCircle, { className: "w-6 h-6 text-yellow-500" }), label: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E", value: fmt(stats.by_decision.confirm), valueClass: "text-yellow-600" }), _jsx(StatCard, { icon: _jsx(CheckCircle, { className: "w-6 h-6 text-green-500" }), label: "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043E", value: fmt(stats.by_decision.allow), valueClass: "text-green-600" }), _jsx(StatCard, { icon: _jsx(Clock, { className: "w-6 h-6 text-purple-500" }), label: "P95 \u0437\u0430\u0434\u0435\u0440\u0436\u043A\u0430", value: `${stats.latency_p95_ms} мс`, valueClass: "text-purple-700" })] })) : null })), _jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-6", children: [_jsxs("div", { className: "xl:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6", children: [_jsx("h2", { className: "text-base font-semibold text-gray-800 dark:text-gray-100 mb-4", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C \u0437\u0430 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 24 \u0447\u0430\u0441\u0430" }), timelineLoading ? (_jsx("div", { className: "h-64 bg-gray-50 dark:bg-slate-900 rounded animate-pulse" })) : chartData.length === 0 ? (_jsx("div", { className: "h-64 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm", children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" })) : (_jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(BarChart, { data: chartData, margin: { top: 4, right: 8, left: -16, bottom: 0 }, barSize: 10, barGap: 2, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#cbd5e1", vertical: false }), _jsx(XAxis, { dataKey: "hour", tick: { fontSize: 11, fill: '#9ca3af' }, tickLine: false, axisLine: false }), _jsx(YAxis, { tick: { fontSize: 11, fill: '#9ca3af' }, tickLine: false, axisLine: false, allowDecimals: false }), _jsx(Tooltip, { content: _jsx(CustomTooltip, {}) }), _jsx(Legend, { iconType: "circle", iconSize: 8, wrapperStyle: { fontSize: 12, paddingTop: 12, color: '#64748b' } }), _jsx(Bar, { dataKey: "\u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u043E", fill: "#22c55e", radius: [3, 3, 0, 0] }), _jsx(Bar, { dataKey: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", fill: "#eab308", radius: [3, 3, 0, 0] }), _jsx(Bar, { dataKey: "\u0417\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D\u043E", fill: "#ef4444", radius: [3, 3, 0, 0] })] }) }))] }), _jsxs("div", { className: "bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden", children: [_jsx("div", { className: "px-5 py-4 border-b border-gray-100 dark:border-slate-700", children: _jsx("h2", { className: "text-base font-semibold text-gray-800 dark:text-gray-100", children: "\u0422\u043E\u043F \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439 \u0443\u0433\u0440\u043E\u0437" }) }), statsLoading ? (_jsx("div", { className: "p-4 space-y-2 animate-pulse", children: Array.from({ length: 6 }).map((_, i) => (_jsx("div", { className: "h-8 bg-gray-100 dark:bg-slate-700 rounded" }, i))) })) : topCategories.length === 0 ? (_jsx("div", { className: "p-6 text-center text-gray-400 dark:text-gray-500 text-sm", children: "\u041D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 dark:bg-slate-900 text-left", children: [_jsx("th", { className: "px-5 py-2.5 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { className: "px-5 py-2.5 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide text-right", children: "\u041A\u043E\u043B-\u0432\u043E" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-50 dark:divide-slate-700", children: topCategories.map(({ category, count }, idx) => (_jsxs("tr", { className: "hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors", children: [_jsxs("td", { className: "px-5 py-2.5 text-gray-700 dark:text-gray-200 font-mono text-xs", children: [_jsxs("span", { className: "text-gray-400 dark:text-gray-500 mr-2", children: [idx + 1, "."] }), category] }), _jsx("td", { className: "px-5 py-2.5 text-right", children: _jsx("span", { className: "font-semibold text-gray-800 dark:text-gray-100", children: fmt(count) }) })] }, category))) })] }) }))] })] })] }));
}
