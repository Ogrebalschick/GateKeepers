import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { DecisionBadge, RiskBadge } from '../components';
import LogDetailDrawer from '../components/LogDetailDrawer';
import LogFilters from '../components/LogFilters';
import { exportLogs, getLogById, getLogs } from '../services/api';
import type { Decision, LogItem, RiskLevel } from '../types';

interface Filters {
  decision: Decision | '';
  risk_level: RiskLevel | '';
  risk_category: string;
  user_id: string;
  user_name: string;
  search: string;
  date_from: string;
  date_to: string;
  page: number;
  per_page: number;
}

const EMPTY: Filters = {
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

const ROLE_CLASS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-800',
  sre: 'bg-green-100 text-green-800',
  developer: 'bg-orange-100 text-orange-800',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export default function LogsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () =>
      getLogs({
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
    queryFn: () => getLogById(selectedId as number),
    enabled: selectedId != null,
  });

  function patch(partial: Partial<Filters>) {
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
    } catch (error) {
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Журнал проверок</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            История всех проверок запросов ИИ-Сторожем
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Экспорт CSV
        </button>
      </div>

      <LogFilters
        values={filters}
        onChange={(next) => patch(next)}
        onReset={() => {
          setSelectedId(null);
          setFilters(EMPTY);
        }}
      />

      {filters.user_id && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md mb-4 flex items-center gap-2 w-fit">
          <span className="text-sm">Показаны запросы: {filters.user_name}</span>
          <button
            type="button"
            aria-label="Сбросить фильтр пользователя"
            onClick={() => patch({ user_id: '', user_name: '' })}
            className="hover:text-red-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isError ? (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 text-red-500" />
          Не удалось загрузить журнал
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          Загрузка журнала…
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-gray-200 text-sm font-medium text-left">
                  <th className="px-4 py-2.5">Время</th>
                  <th className="px-4 py-2.5">Пользователь</th>
                  <th className="px-4 py-2.5">Запрос</th>
                  <th className="px-4 py-2.5">Решение</th>
                  <th className="px-4 py-2.5">Риск</th>
                  <th className="px-4 py-2.5">Категория</th>
                  <th className="px-4 py-2.5 text-right">Задержка</th>
                  <th className="px-4 py-2.5">Слой</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                    >
                      Записей не найдено
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <LogRow
                      key={item.id}
                      item={item}
                      onOpen={() => setSelectedId(item.id)}
                      onUser={() =>
                        patch({ user_id: item.user_id, user_name: item.user_name, page: 1 })
                      }
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-gray-300">
        <span>
          Запись {from}–{to} из {total}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => patch({ page: page - 1 })}
            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed"
          >
            ‹ Назад
          </button>
          <button
            type="button"
            disabled={!data || page >= data.pages || isLoading}
            onClick={() => patch({ page: page + 1 })}
            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 cursor-pointer disabled:cursor-not-allowed"
          >
            Далее ›
          </button>
        </div>
      </div>

      <LogDetailDrawer
        open={selectedId != null}
        loading={detailLoading}
        detail={detail ?? null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function LogRow({
  item,
  onOpen,
  onUser,
}: {
  item: LogItem;
  onOpen: () => void;
  onUser: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
    >
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 dark:text-gray-400">
        {fmtTime(item.created_at)}
      </td>
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUser();
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
        >
          {item.user_name}
        </button>
        <span
          className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs ${ROLE_CLASS[item.user_role] ?? 'bg-gray-100 text-gray-700 dark:text-gray-200'}`}
        >
          {item.user_role}
        </span>
      </td>
      <td className="px-4 py-2.5 text-gray-800 dark:text-gray-100 max-w-xs">
        {clip(item.user_prompt)}
      </td>
      <td className="px-4 py-2.5">
        <DecisionBadge decision={item.decision} size="sm" />
      </td>
      <td className="px-4 py-2.5">
        <RiskBadge riskLevel={item.risk_level} size="sm" />
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-300">
        {item.risk_category}
      </td>
      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">{item.latency_ms}</td>
      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{item.pipeline_layer}</td>
    </tr>
  );
}
