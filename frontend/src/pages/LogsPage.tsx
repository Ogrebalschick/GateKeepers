import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useState } from 'react';
import { DecisionBadge, RiskBadge } from '../components';
import { exportLogs, getLogById, getLogs } from '../services/api';
import type { Decision, RiskLevel } from '../types';

const PER_PAGE = 50;

interface Filters {
  decision: Decision | '';
  risk_level: RiskLevel | '';
  search: string;
  date_from: string;
  date_to: string;
  user_id: string;
  user_name: string;
  page: number;
}

const EMPTY_FILTERS: Filters = {
  decision: '',
  risk_level: '',
  search: '',
  date_from: '',
  date_to: '',
  user_id: '',
  user_name: '',
  page: 1,
};

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function LogsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () =>
      getLogs({
        decision: filters.decision || undefined,
        risk_level: filters.risk_level || undefined,
        search: filters.search || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        user_id: filters.user_id || undefined,
        page: filters.page,
        per_page: PER_PAGE,
      }),
    staleTime: 30_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['log', selectedId],
    queryFn: () => getLogById(selectedId!),
    enabled: selectedId != null,
  });

  function patch(partial: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...partial, page: partial.page ?? 1 }));
  }

  function filterByUser(userId: string, userName: string) {
    setSelectedId(null);
    setFilters((prev) => ({
      ...prev,
      user_id: userId,
      user_name: userName,
      page: 1,
    }));
  }

  function clearUser() {
    setFilters((prev) => ({ ...prev, user_id: '', user_name: '', page: 1 }));
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? filters.page;
  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Журнал</h1>
          <p className="text-sm text-gray-500 mt-0.5">Все проверки ИИ-Сторожа</p>
        </div>
        <button
          type="button"
          onClick={() =>
            exportLogs({
              decision: filters.decision || undefined,
              risk_level: filters.risk_level || undefined,
              search: filters.search || undefined,
              user_id: filters.user_id || undefined,
              date_from: filters.date_from || undefined,
              date_to: filters.date_to || undefined,
            })
          }
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Экспорт CSV
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <select
          className={fieldClass}
          value={filters.decision}
          onChange={(e) => patch({ decision: e.target.value as Decision | '' })}
          aria-label="Решение"
        >
          <option value="">Все решения</option>
          <option value="allow">Разрешено</option>
          <option value="confirm">Подтвердить</option>
          <option value="block">Заблокировано</option>
        </select>
        <select
          className={fieldClass}
          value={filters.risk_level}
          onChange={(e) => patch({ risk_level: e.target.value as RiskLevel | '' })}
          aria-label="Уровень риска"
        >
          <option value="">Все уровни</option>
          <option value="none">Нет</option>
          <option value="low">Низкий</option>
          <option value="medium">Средний</option>
          <option value="high">Высокий</option>
          <option value="critical">Критический</option>
        </select>
        <input
          className={fieldClass}
          placeholder="Поиск по запросу"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          aria-label="Поиск"
        />
        <input
          className={fieldClass}
          type="date"
          value={filters.date_from}
          onChange={(e) => patch({ date_from: e.target.value })}
          aria-label="Дата от"
        />
        <input
          className={fieldClass}
          type="date"
          value={filters.date_to}
          onChange={(e) => patch({ date_to: e.target.value })}
          aria-label="Дата до"
        />
        <button
          type="button"
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Сбросить
        </button>
      </div>

      {filters.user_id && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md mb-4 flex items-center gap-2 w-fit">
          <span className="text-sm">Показаны запросы пользователя: {filters.user_name}</span>
          <button type="button" onClick={clearUser} aria-label="Сбросить фильтр пользователя">
            <X className="w-4 h-4 cursor-pointer hover:text-red-600" />
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isError ? (
          <p className="p-6 text-sm text-red-600">Не удалось загрузить журнал</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-gray-400">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Записей не найдено</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Время</th>
                  <th className="px-4 py-2.5 font-medium">Пользователь</th>
                  <th className="px-4 py-2.5 font-medium">Роль</th>
                  <th className="px-4 py-2.5 font-medium">Запрос</th>
                  <th className="px-4 py-2.5 font-medium">Решение</th>
                  <th className="px-4 py-2.5 font-medium">Риск</th>
                  <th className="px-4 py-2.5 font-medium">Категория</th>
                  <th className="px-4 py-2.5 font-medium text-right">мс</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">
                      {fmtTime(item.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          filterByUser(item.user_id, item.user_name);
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {item.user_name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{item.user_role}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-xs">{clip(item.user_prompt)}</td>
                    <td className="px-4 py-2.5">
                      <DecisionBadge decision={item.decision} size="sm" />
                    </td>
                    <td className="px-4 py-2.5">
                      <RiskBadge riskLevel={item.risk_level} size="sm" />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                      {item.risk_category}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{item.latency_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
          <span>
            Запись {from}–{to} из {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => patch({ page: page - 1 })}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!data || page >= data.pages}
              onClick={() => patch({ page: page + 1 })}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              aria-label="Следующая страница"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedId != null && (
        <LogDetailDrawer
          loading={detailLoading}
          item={detail ?? null}
          onClose={() => setSelectedId(null)}
          onShowUser={(userId, userName) => filterByUser(userId, userName)}
        />
      )}
    </div>
  );
}

function LogDetailDrawer({
  item,
  loading,
  onClose,
  onShowUser,
}: {
  item: Awaited<ReturnType<typeof getLogById>> | null;
  loading: boolean;
  onClose: () => void;
  onShowUser: (userId: string, userName: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-md h-full bg-white shadow-xl overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Запись журнала</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть панель">
            <X className="w-5 h-5 text-gray-500 hover:text-gray-800" />
          </button>
        </div>

        {loading || !item ? (
          <p className="text-sm text-gray-400">Загрузка…</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <DecisionBadge decision={item.decision} />
              <RiskBadge riskLevel={item.risk_level} />
            </div>
            <Field
              label="Пользователь"
              value={`${item.context.user_name} · ${item.context.user_role}`}
            />
            <Field label="Запрос" value={item.user_prompt} />
            <Field label="Объяснение" value={item.explanation} />
            <Field label="Категория" value={item.risk_category} />
            <Field label="Задержка" value={`${item.latency_ms} мс`} />
            <Field label="Слой" value={item.pipeline_layer} />
            <Field label="ID проверки" value={item.check_id} />
            <button
              type="button"
              onClick={() => onShowUser(item.context.user_id, item.context.user_name)}
              className="w-full mt-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Показать все запросы этого пользователя
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-800 whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}
