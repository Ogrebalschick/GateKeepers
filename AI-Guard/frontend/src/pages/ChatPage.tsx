import { MessageSquare, User } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import ChatInput from '../components/chat/ChatInput';
import ChatLayout from '../components/chat/ChatLayout';
import { RoleBadge } from '../components/RoleBadge';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function ChatPage() {
  const [selectedSessionId] = useState<string | null>(null);
  const { username, role, isAuthenticated } = useCurrentUser();

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">DevOps-ассистент</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">it_ops_agent</div>
        </div>
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
                <User className="h-4 w-4 text-white" />
              </div>
              <span className="hidden text-sm sm:inline">{username}</span>
              <RoleBadge role={role} />
            </div>
            <a
              href="/logs"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Админка
            </a>
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Войти
          </Link>
        )}
      </header>
      <ChatLayout
        sidebar={
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-gray-200 px-4 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => toast('Дальше в CHAT-003')}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Новый чат
              </button>
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <MessageSquare className="mb-3 h-12 w-12 text-gray-300 dark:text-slate-500" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {selectedSessionId
                ? `Чат ${selectedSessionId.slice(0, 8)}`
                : 'Напишите DevOps-ассистенту'}
            </p>
          </div>
          <ChatInput />
        </div>
      </ChatLayout>
    </div>
  );
}
