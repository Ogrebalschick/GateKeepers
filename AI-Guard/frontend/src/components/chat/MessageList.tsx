import { Loader2 } from 'lucide-react';
import { useRef } from 'react';
import type { SessionDetail } from '../../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  session: SessionDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  fullTextByCheckId: Record<string, string>;
}

function statusLabel(status: SessionDetail['status']): string {
  return status === 'active' ? 'активна' : 'закрыта';
}

export default function MessageList({
  session,
  isLoading,
  isError,
  fullTextByCheckId,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {session && (
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 text-sm dark:border-slate-700">
          <span className="font-medium">Чат {session.session_id.slice(0, 8)}</span>
          <span className="text-gray-500 dark:text-slate-400">
            {' '}
            · {statusLabel(session.status)} · {session.request_count}/{session.max_requests}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {!isLoading && isError && (
          <p className="text-center text-sm text-gray-500 dark:text-slate-400">
            Не удалось открыть чат
          </p>
        )}

        {!isLoading && !isError && session && session.messages.length === 0 && (
          <p className="text-center text-sm text-gray-500 dark:text-slate-400">
            Напишите первое сообщение. Сторож проверит его до DevOps-агента
          </p>
        )}

        {!isLoading && !isError && session && session.messages.length > 0 && (
          <div className="space-y-4">
            {session.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                fullText={fullTextByCheckId[message.check_id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
