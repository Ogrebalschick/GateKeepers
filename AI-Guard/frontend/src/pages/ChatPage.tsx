import { MessageSquare, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ChatInput from '../components/chat/ChatInput';
import ChatLayout from '../components/chat/ChatLayout';
import NewChatModal from '../components/chat/NewChatModal';
import SessionSidebar from '../components/chat/SessionSidebar';
import { RoleBadge } from '../components/RoleBadge';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { logout } from '../services/api';

export default function ChatPage() {
  const navigate = useNavigate();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { username, role, isAuthenticated } = useCurrentUser();

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
            onSelect={setSelectedSessionId}
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <MessageSquare className="mb-3 h-12 w-12 text-gray-300 dark:text-slate-500" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {selectedSessionId ? selectedSessionId : 'Напишите DevOps-ассистенту'}
            </p>
          </div>
          <ChatInput />
        </div>
      </ChatLayout>
      <NewChatModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(sessionId) => {
          setSelectedSessionId(sessionId);
          setIsCreateModalOpen(false);
        }}
      />
    </div>
  );
}
