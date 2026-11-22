import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { getSessions } from '../../services/api';
import SessionItem from './SessionItem';

interface SessionSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
}

export default function SessionSidebar({
  selectedId,
  onSelect,
  onCreateClick,
}: SessionSidebarProps) {
  const { isAuthenticated } = useCurrentUser();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sessions', 'chat'],
    queryFn: () => getSessions({ page: 1, per_page: 50 }),
    enabled: isAuthenticated,
  });

  const sessions = [...(data?.items ?? [])].sort(
    (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-slate-700">
        <button
          type="button"
          onClick={onCreateClick}
          className="flex w-full cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Новый чат
        </button>
      </div>

      {!isAuthenticated && (
        <div className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400">
          <p>Войдите, чтобы видеть историю чатов</p>
          <Link
            to="/login?redirect=%2Fchat"
            className="mt-2 inline-block text-blue-600 hover:underline"
          >
            Войти
          </Link>
        </div>
      )}

      {isAuthenticated && isLoading && (
        <div className="space-y-2 px-3 py-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-700"
            />
          ))}
        </div>
      )}

      {isAuthenticated && isError && (
        <div className="px-4 py-6 text-sm text-gray-600 dark:text-slate-300">
          <p>Не удалось загрузить чаты</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            Повторить
          </button>
        </div>
      )}

      {isAuthenticated && !isLoading && !isError && sessions.length === 0 && (
        <p className="px-4 py-6 text-sm text-gray-500 dark:text-slate-400">Чатов пока нет</p>
      )}

      {isAuthenticated && !isLoading && !isError && sessions.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {sessions.map((session) => (
            <li key={session.session_id}>
              <SessionItem
                session={session}
                active={session.session_id === selectedId}
                onSelect={() => onSelect(session.session_id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
