import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, Loader2, MessageSquare, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { createSession, getSessions } from '../services/api';
import type { Session, UserRole } from '../types';

const ROLE_CLASS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-800',
  sre: 'bg-green-100 text-green-800',
  developer: 'bg-orange-100 text-orange-800',
};

const fieldClass =
  'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU');
}

function countClass(count: number, max: number): string {
  if (max <= 0) return 'text-gray-800';
  const ratio = count / max;
  if (ratio >= 0.8) return 'text-red-600 font-medium';
  if (ratio >= 0.5) return 'text-yellow-600 font-medium';
  return 'text-gray-800';
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сессии диалогов</h1>
          <p className="text-sm text-gray-500 mt-0.5">История проверок с сохранением контекста</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Новая сессия
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          Загрузка сессий…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-600 py-4">
          <AlertCircle className="w-5 h-5 text-red-500" />
          Не удалось загрузить сессии
        </div>
      )}

      {data && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <MessageSquare className="w-16 h-16 text-gray-300" />
          <p className="mt-3 text-sm">Нет сессий. Создайте первую!</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 text-gray-700 text-sm font-medium">
                <tr>
                  <th className="text-left px-4 py-3">Session ID</th>
                  <th className="text-left px-4 py-3">Создана</th>
                  <th className="text-left px-4 py-3">Роль</th>
                  <th className="text-left px-4 py-3">Запросов</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="text-left px-4 py-3">Угрозы</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <SessionRow
                    key={item.session_id}
                    item={item}
                    onOpen={() => navigate(`/sessions/${item.session_id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <CreateSessionModal
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['sessions'] });
          }}
        />
      )}
    </div>
  );
}

function SessionRow({ item, onOpen }: { item: Session; onOpen: () => void }) {
  const role = item.user_role ?? '';
  return (
    <tr onClick={onOpen} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer">
      <td className="px-4 py-2.5 font-mono text-gray-800">{shortId(item.session_id)}</td>
      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{fmtDate(item.created_at)}</td>
      <td className="px-4 py-2.5">
        {role ? (
          <span
            className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASS[role] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {role}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className={`px-4 py-2.5 ${countClass(item.request_count, item.max_requests)}`}>
        {item.request_count}/{item.max_requests}
      </td>
      <td className="px-4 py-2.5">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-4 py-2.5">
        {item.threat_flags.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {item.threat_flags.length}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
        active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {active ? 'Активна' : 'Закрыта'}
    </span>
  );
}

function CreateSessionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [role, setRole] = useState<UserRole>('admin');
  const [maxRequests, setMaxRequests] = useState(100);

  const create = useMutation({
    mutationFn: createSession,
    onSuccess: (session) => {
      toast.success(`Сессия создана: ${session.session_id}`);
      onCreated();
    },
    onError: () => toast.error('Не удалось создать сессию'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const max = Math.min(1000, Math.max(1, Math.trunc(maxRequests) || 1));
    create.mutate({
      user_id: localStorage.getItem('guard_user_id'),
      user_role: role,
      max_requests: max,
      metadata: null,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/40 cursor-pointer"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md bg-white rounded-lg shadow-xl border border-gray-200 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Новая сессия</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm text-gray-600 mb-3">
          Роль
          <select
            className={`${fieldClass} cursor-pointer`}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="developer">developer</option>
            <option value="sre">sre</option>
            <option value="admin">admin</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600 mb-5">
          Лимит запросов
          <input
            type="number"
            min={1}
            max={1000}
            value={maxRequests}
            onChange={(e) => setMaxRequests(Number(e.target.value))}
            className={fieldClass}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={create.isPending}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer disabled:cursor-not-allowed"
          >
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Создать
          </button>
        </div>
      </form>
    </div>
  );
}
