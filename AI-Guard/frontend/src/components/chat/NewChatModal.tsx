import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { createSession } from '../../services/api';

const ROLES = ['developer', 'sre', 'admin'] as const;
type ChatRole = (typeof ROLES)[number];

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (sessionId: string) => void;
}

function defaultRole(role: string): ChatRole {
  return ROLES.includes(role as ChatRole) ? (role as ChatRole) : 'developer';
}

function readApiMessage(err: unknown): string {
  const data = (err as { response?: { data?: { detail?: unknown; error?: unknown } } })?.response
    ?.data;
  if (typeof data?.error === 'string' && data.error) return data.error;
  if (typeof data?.detail === 'string' && data.detail) return data.detail;
  if (Array.isArray(data?.detail)) {
    const text = data.detail
      .map((item) => (typeof item === 'string' ? item : (item as { msg?: string } | null)?.msg))
      .filter((item): item is string => Boolean(item))
      .join('. ');
    if (text) return text;
  }
  return 'Не удалось создать чат';
}

export default function NewChatModal({ open, onClose, onCreated }: NewChatModalProps) {
  const queryClient = useQueryClient();
  const { role: currentRole, userId } = useCurrentUser();
  const [role, setRole] = useState<ChatRole>(defaultRole(currentRole));
  const [maxRequests, setMaxRequests] = useState(100);

  useEffect(() => {
    if (!open) return;
    setRole(defaultRole(currentRole));
    setMaxRequests(100);
  }, [open, currentRole]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const create = useMutation({
    mutationFn: createSession,
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Чат создан');
      onCreated(session.session_id);
    },
    onError: (err: unknown) => {
      toast.error(readApiMessage(err));
    },
  });

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const max = Math.min(1000, Math.max(1, Math.trunc(maxRequests) || 1));
    create.mutate({
      user_id: userId || null,
      user_role: role,
      max_requests: max,
      metadata: null,
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 cursor-pointer bg-black/50 dark:bg-black/60"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onSubmit={submit}
        className="relative w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 text-gray-900 shadow-xl dark:border-slate-700 dark:bg-gray-800 dark:text-white"
      >
        <h2 id="new-chat-title" className="text-lg font-semibold">
          Новый чат
        </h2>

        <label className="mt-4 block text-sm" htmlFor="new-chat-role">
          Роль
        </label>
        <select
          id="new-chat-role"
          value={role}
          onChange={(event) => setRole(event.target.value as ChatRole)}
          disabled={create.isPending}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
          Проверка промпта пойдёт от роли текущего логина. Селект записывает user_role в сессию и
          подпись в sidebar.
        </p>

        <label className="mt-4 block text-sm" htmlFor="new-chat-limit">
          Лимит запросов
        </label>
        <input
          id="new-chat-limit"
          type="number"
          min={1}
          max={1000}
          value={maxRequests}
          disabled={create.isPending}
          onChange={(event) => setMaxRequests(Number(event.target.value))}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
          >
            {create.isPending ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}
