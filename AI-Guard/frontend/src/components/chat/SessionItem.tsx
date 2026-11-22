import type { Session } from '../../types';

interface SessionItemProps {
  session: Session;
  active: boolean;
  onSelect: () => void;
}

function formatActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleString('ru', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionItem({ session, active, onSelect }: SessionItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors',
        'hover:bg-gray-100 dark:hover:bg-slate-800',
        active
          ? 'bg-blue-50 text-blue-900 dark:bg-slate-700 dark:text-gray-100'
          : 'text-gray-800 dark:text-gray-100',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">Чат {session.session_id.slice(0, 8)}</span>
        <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400">
          {formatActivity(session.last_activity_at)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
        <span
          className={[
            'h-2 w-2 shrink-0 rounded-full',
            session.status === 'active' ? 'bg-green-500' : 'bg-gray-400',
          ].join(' ')}
          aria-hidden
        />
        <span className="truncate">{session.user_role || '—'}</span>
        <span className="shrink-0">
          {session.request_count}/{session.max_requests}
        </span>
      </div>
      {session.threat_flags.length > 0 && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">угроза</div>
      )}
    </button>
  );
}
