import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Pencil, Save, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getPolicy, getPolicyHistory, updatePolicy } from '../services/api';
import type { PolicyVersion } from '../types';

type Tab = 'current' | 'history';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readApiError(err: unknown): { status?: number; detail: string } {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { status?: number; data?: { detail?: string } } })
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

  const [tab, setTab] = useState<Tab>('current');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [comment, setComment] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const {
    data: policy,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['policy'],
    queryFn: getPolicy,
    staleTime: 30_000,
  });

  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
  } = useQuery({
    queryKey: ['policy-history'],
    queryFn: getPolicyHistory,
    enabled: tab === 'history',
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: updatePolicy,
    onSuccess: (res) => {
      const next: PolicyVersion = {
        version: res.version,
        content_yaml: res.content_yaml,
        created_at: policy?.created_at ?? res.updated_at,
        updated_at: res.updated_at,
        updated_by: res.updated_by,
        comment: res.comment,
      };
      queryClient.setQueryData(['policy'], next);
      void queryClient.invalidateQueries({ queryKey: ['policy-history'] });
      setDraft(res.content_yaml);
      setComment('');
      setErrorBanner(null);
      setEditing(false);
      if (res.reload_status === 'ok') {
        toast.success(`Политика обновлена, версия ${res.version}, ML перезагружен`);
      } else {
        toast.error(`Политика сохранена (версия ${res.version}), но ML не перезагружен`);
      }
    },
    onError: (err) => {
      const { status, detail } = readApiError(err);
      if (status === 400) setErrorBanner(`Невалидный YAML: ${detail}`);
      else if (status === 422) setErrorBanner(`Схема политики нарушена: ${detail}`);
      else toast.error(detail);
    },
  });

  function startEdit() {
    if (!isAdmin || !policy) return;
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Политика безопасности</h1>
      <p className="text-sm text-gray-500 mt-0.5 mb-4">Управление правилами ИИ-Сторожа</p>

      <div className="bg-white border-b border-gray-200 mb-4 flex gap-1">
        <TabButton active={tab === 'current'} onClick={() => setTab('current')}>
          Текущая политика
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
          История версий
        </TabButton>
      </div>

      {tab === 'current' && (
        <>
          {isLoading && (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              Загрузка политики…
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-2 text-red-600 py-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Не удалось загрузить политику
            </div>
          )}
          {policy && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-4">
                <Meta label="Версия">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    v{policy.version}
                  </span>
                </Meta>
                <Meta label="Обновлено">{fmtDate(policy.updated_at)}</Meta>
                <Meta label="Кем">{policy.updated_by}</Meta>
                {policy.comment && <Meta label="Комментарий">{policy.comment}</Meta>}
              </div>

              {errorBanner && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                  <span>{errorBanner}</span>
                </div>
              )}

              <textarea
                value={editing ? draft : (policy.content_yaml ?? '')}
                onChange={(e) => setDraft(e.target.value)}
                readOnly={!editing}
                spellCheck={false}
                aria-label="YAML политики"
                className={[
                  'w-full h-96 font-mono text-sm rounded-lg p-4 resize-y',
                  editing
                    ? 'bg-white border-2 border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none'
                    : 'bg-gray-100 border border-gray-200 text-gray-700',
                ].join(' ')}
              />

              <div className="mt-4 flex flex-wrap items-end gap-3">
                {!editing && isAdmin && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                    Редактировать
                  </button>
                )}
                {!editing && !isAdmin && (
                  <p className="text-sm text-gray-500">Только admin может редактировать</p>
                )}
                {editing && (
                  <>
                    <label className="flex flex-col gap-1 text-sm text-gray-600 flex-1 min-w-[240px]">
                      Комментарий к изменению (необязательно)
                      <input
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={save.isPending}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
                    >
                      {save.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={save.isPending}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                      Отмена
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          {historyLoading && (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              Загрузка истории…
            </div>
          )}
          {historyError && (
            <div className="flex items-center gap-2 text-red-600 py-4">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Не удалось загрузить историю версий
            </div>
          )}
          {history && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-gray-50 text-gray-700 text-sm font-medium">
                    <tr>
                      <th className="text-left px-4 py-3">Версия</th>
                      <th className="text-left px-4 py-3">Дата обновления</th>
                      <th className="text-left px-4 py-3">Кем</th>
                      <th className="text-left px-4 py-3">Комментарий</th>
                      <th className="text-left px-4 py-3">Активная</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          Версий нет
                        </td>
                      </tr>
                    ) : (
                      history.items.map((item) => (
                        <tr
                          key={item.version}
                          className={
                            item.is_active
                              ? 'border-t border-gray-100 bg-blue-50 font-medium'
                              : 'border-t border-gray-100'
                          }
                        >
                          <td className="px-4 py-2.5">v{item.version}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {fmtDate(item.updated_at)}
                          </td>
                          <td className="px-4 py-2.5">{item.updated_by}</td>
                          <td className="px-4 py-2.5 text-gray-600">{item.comment ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            {item.is_active ? (
                              <Check className="w-4 h-4 text-blue-600" aria-label="Активная" />
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors cursor-pointer',
        active
          ? 'border-blue-500 text-blue-600 font-medium'
          : 'border-transparent text-gray-500 hover:text-gray-800',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-gray-500 text-xs mb-0.5">{label}</div>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}
