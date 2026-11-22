import { Loader2 } from 'lucide-react';
import { useRef } from 'react';
import type { SessionDetail, SessionMessage } from '../../types';
import { getMockAgentResponse } from '../../utils/mockAgentResponses';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  session: SessionDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  fullTextByCheckId: Record<string, string>;
  pendingMessages?: SessionMessage[];
}

function statusLabel(status: SessionDetail['status']): string {
  return status === 'active' ? 'активна' : 'закрыта';
}

function agentTextFor(message: SessionMessage, fullText: string | undefined): string | undefined {
  if (message.decision !== 'allow') return undefined;
  return getMockAgentResponse(fullText ?? message.user_prompt);
}

export default function MessageList({
  session,
  isLoading,
  isError,
  fullTextByCheckId,
  pendingMessages = [],
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const serverMessages = session?.messages ?? [];
  const serverIds = new Set(serverMessages.map((message) => message.check_id));
  const messages = [
    ...serverMessages,
    ...pendingMessages.filter((message) => !serverIds.has(message.check_id)),
  ];

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

        {!isLoading && !isError && session && messages.length === 0 && (
          <p className="text-center text-sm text-gray-500 dark:text-slate-400">
            Напишите первое сообщение. Сторож проверит его до DevOps-агента
          </p>
        )}

        {!isLoading && !isError && messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((message) => {
              const fullText = fullTextByCheckId[message.check_id];
              return (
                <MessageBubble
                  key={message.check_id}
                  message={message}
                  fullText={fullText}
                  agentText={agentTextFor(message, fullText)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
