import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import ChatInput from '../components/chat/ChatInput';
import ChatLayout from '../components/chat/ChatLayout';
import MessageList from '../components/chat/MessageList';
import NewChatModal from '../components/chat/NewChatModal';
import SessionSidebar from '../components/chat/SessionSidebar';
import { RoleBadge } from '../components/RoleBadge';
import { DEVOPS_SYSTEM_PROMPT } from '../constants/systemPrompts';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { checkPrompt, getSessionById, logout } from '../services/api';
import type { CheckContextMessage, SessionMessage } from '../types';

function selectedStorageKey(userId: string): string {
  return `chat-selected-session:${userId}`;
}

function isSessionNotFound(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: string } } })
    ?.response;
  return response?.status === 404 || response?.data?.error === 'session_not_found';
}

function readCheckError(err: unknown): string {
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
  return 'Не удалось проверить сообщение';
}

interface LocalTurn {
  sessionId: string | null;
  message: SessionMessage;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId, username, role, isAuthenticated } = useCurrentUser();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() =>
    userId ? sessionStorage.getItem(selectedStorageKey(userId)) : null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [fullTextByCheckId, setFullTextByCheckId] = useState<Record<string, string>>({});
  const [localTurns, setLocalTurns] = useState<LocalTurn[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const missingToastFor = useRef<string | null>(null);
  const localId = useRef(0);

  function selectSession(id: string | null) {
    setSelectedSessionId(id);
    if (!userId) return;
    const key = selectedStorageKey(userId);
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  }

  const sessionQuery = useQuery({
    queryKey: ['session', selectedSessionId],
    queryFn: () => getSessionById(selectedSessionId!),
    enabled: Boolean(selectedSessionId) && isAuthenticated,
    retry: (failureCount, error) => !isSessionNotFound(error) && failureCount < 1,
  });

  const openSession =
    sessionQuery.data?.session_id === selectedSessionId ? sessionQuery.data : undefined;
  const closed = openSession?.status === 'closed';
  const threadSessionId = isAuthenticated ? selectedSessionId : null;
  const pendingMessages = localTurns
    .filter((turn) => turn.sessionId === threadSessionId)
    .map((turn) => turn.message);

  function historyFor(sessionId: string | null): CheckContextMessage[] {
    const server = sessionId && openSession?.session_id === sessionId ? openSession.messages : [];
    const known = new Set(server.map((message) => message.check_id));
    const extra = localTurns
      .filter((turn) => turn.sessionId === sessionId && !known.has(turn.message.check_id))
      .map((turn) => turn.message);
    return [...server, ...extra].slice(-20).map((message) => ({
      role: 'user',
      content: fullTextByCheckId[message.check_id] ?? message.user_prompt,
    }));
  }

  async function handleSend(text: string): Promise<boolean> {
    if (closed) return false;
    if (isAuthenticated && !selectedSessionId) {
      toast.error('Сначала выберите чат');
      return false;
    }

    const sessionId = isAuthenticated ? selectedSessionId : null;
    setPending(true);
    try {
      const data = await checkPrompt({
        user_prompt: text,
        session_id: sessionId,
        context: {
          target_agent: 'it_ops_agent',
          user_role: role,
          user_id: userId,
          user_name: username || 'Гость',
          system_prompt: DEVOPS_SYSTEM_PROMPT,
          history: historyFor(sessionId),
          attachments: [],
        },
      });

      localId.current -= 1;
      const message: SessionMessage = {
        id: localId.current,
        check_id: data.check_id,
        created_at: new Date().toISOString(),
        user_prompt: text,
        decision: data.decision,
        risk_level: data.risk_level,
        risk_category: data.risk_category,
        explanation: data.explanation,
        latency_ms: data.latency_ms,
        is_multi_step_attack: data.is_multi_step_attack === true,
      };
      setFullTextByCheckId((prev) => ({ ...prev, [data.check_id]: text }));
      setLocalTurns((prev) => [...prev, { sessionId, message }]);
      if (sessionId) {
        await queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
        await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }
      return true;
    } catch (err) {
      toast.error(readCheckError(err));
      return false;
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!selectedSessionId || !sessionQuery.isError || !isSessionNotFound(sessionQuery.error)) {
      return;
    }
    if (missingToastFor.current === selectedSessionId) return;
    missingToastFor.current = selectedSessionId;
    toast.error('Чат не найден');
    selectSession(null);
  }, [selectedSessionId, sessionQuery.isError, sessionQuery.error, userId]);

  const showThread = Boolean(selectedSessionId) || pendingMessages.length > 0;

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">DevOps-ассистент</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">it_ops_agent</div>
        </div>
        {isAuthenticated ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                <User className="h-4 w-4 text-white" />
              </div>
              <span className="hidden text-sm sm:inline">{username}</span>
              <RoleBadge role={role} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
              >
                <a
                  href="/logs"
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-slate-700"
                >
                  Открыть админку
                </a>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    logout('/chat');
                  }}
                  className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-slate-700"
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/login?redirect=%2Fchat"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Войти
          </Link>
        )}
      </header>
      <ChatLayout
        sidebar={
          <SessionSidebar
            selectedId={selectedSessionId}
            onSelect={selectSession}
            onCreateClick={() => {
              if (!isAuthenticated) {
                navigate('/login?redirect=%2Fchat');
                return;
              }
              setIsCreateModalOpen(true);
            }}
          />
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {showThread ? (
            <MessageList
              session={isAuthenticated ? openSession : undefined}
              isLoading={Boolean(isAuthenticated && selectedSessionId && sessionQuery.isLoading)}
              isError={Boolean(
                isAuthenticated && sessionQuery.isError && !isSessionNotFound(sessionQuery.error),
              )}
              fullTextByCheckId={fullTextByCheckId}
              pendingMessages={pendingMessages}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              <MessageSquare className="mb-3 h-12 w-12 text-gray-300 dark:text-slate-500" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Напишите DevOps-ассистенту
              </p>
            </div>
          )}
          {closed && (
            <p className="px-4 pt-3 text-center text-sm text-gray-500 dark:text-slate-400">
              Сессия закрыта: лимит запросов исчерпан
            </p>
          )}
          <ChatInput disabled={closed} pending={pending} onSend={handleSend} />
        </div>
      </ChatLayout>
      <NewChatModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(sessionId) => {
          setSelectedSessionId(sessionId);
          if (userId) sessionStorage.setItem(selectedStorageKey(userId), sessionId);
          setIsCreateModalOpen(false);
        }}
      />
    </div>
  );
}
