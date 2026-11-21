import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, CheckCircle, Clock, ShieldX } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getStats, getTimeline } from '../services/api';
import type { StatsResponse, TimelineItem } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

/** Format ISO hour string → "14:00" */
function fmtHour(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}

function StatCard({
  icon,
  label,
  value,
  valueClass = 'text-gray-900 dark:text-white',
}: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700 flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-tight ${valueClass}`}>{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-slate-700 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded bg-gray-200 dark:bg-slate-700 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-16" />
          <div className="h-3 bg-gray-100 dark:bg-slate-700 rounded w-24" />
        </div>
      </div>
    </div>
  );
}

// ─── Custom tooltip for BarChart ──────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: getStats,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery<{ items: TimelineItem[] }>({
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

  return (
    <div className="space-y-6">
      {/* ── Page title ───────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Дашборд</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Статистика обновляется каждые 30 секунд
        </p>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {statsError ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          Не удалось загрузить статистику
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {statsLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : stats ? (
            <>
              <StatCard
                icon={<Activity className="w-6 h-6 text-blue-500" />}
                label="Всего проверок"
                value={fmt(stats.total_checks)}
              />
              <StatCard
                icon={<ShieldX className="w-6 h-6 text-red-500" />}
                label="Заблокировано"
                value={fmt(stats.by_decision.block)}
                valueClass="text-red-600"
              />
              <StatCard
                icon={<AlertCircle className="w-6 h-6 text-yellow-500" />}
                label="Подтверждено"
                value={fmt(stats.by_decision.confirm)}
                valueClass="text-yellow-600"
              />
              <StatCard
                icon={<CheckCircle className="w-6 h-6 text-green-500" />}
                label="Разрешено"
                value={fmt(stats.by_decision.allow)}
                valueClass="text-green-600"
              />
              <StatCard
                icon={<Clock className="w-6 h-6 text-purple-500" />}
                label="P95 задержка"
                value={`${stats.latency_p95_ms} мс`}
                valueClass="text-purple-700"
              />
            </>
          ) : null}
        </div>
      )}

      {/* ── Bottom grid: chart + table ────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Timeline bar chart */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Активность за последние 24 часа
          </h2>

          {timelineLoading ? (
            <div className="h-64 bg-gray-50 dark:bg-slate-900 rounded animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Нет данных
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                barSize={10}
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12, color: '#64748b' }}
                />
                <Bar dataKey="Разрешено" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Подтвердить" fill="#eab308" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Заблокировано" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top categories table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Топ категорий угроз
            </h2>
          </div>

          {statsLoading ? (
            <div className="p-4 space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 dark:bg-slate-700 rounded" />
              ))}
            </div>
          ) : topCategories.length === 0 ? (
            <div className="p-6 text-center text-gray-400 dark:text-gray-500 text-sm">
              Нет данных
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900 text-left">
                    <th className="px-5 py-2.5 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Категория
                    </th>
                    <th className="px-5 py-2.5 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide text-right">
                      Кол-во
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                  {topCategories.map(({ category, count }, idx) => (
                    <tr
                      key={category}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <td className="px-5 py-2.5 text-gray-700 dark:text-gray-200 font-mono text-xs">
                        <span className="text-gray-400 dark:text-gray-500 mr-2">{idx + 1}.</span>
                        {category}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                          {fmt(count)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
