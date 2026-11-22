import {
  BarChart3,
  FileText,
  GraduationCap,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { ensureSeedData, logout } from '../services/api';
import { RoleBadge } from './RoleBadge';
import { ThemeToggle } from './ThemeToggle';
import { useTour } from './Tour';

interface NavItem {
  to: string;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  roles: string[];
  tourId?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', Icon: Search, label: '💬 Чат', roles: ['admin', 'sre', 'developer'] },
  {
    to: '/dashboard',
    Icon: BarChart3,
    label: 'Дашборд',
    roles: ['admin', 'sre'],
    tourId: 'tour-dashboard-link',
  },
  {
    to: '/logs',
    Icon: FileText,
    label: 'Журнал',
    roles: ['admin', 'sre', 'developer'],
    tourId: 'tour-logs-link',
  },
  {
    to: '/policy',
    Icon: Settings,
    label: 'Политика',
    roles: ['admin', 'sre'],
    tourId: 'tour-policy-link',
  },
  {
    to: '/sessions',
    Icon: MessageSquare,
    label: 'Сессии',
    roles: ['admin', 'sre', 'developer'],
    tourId: 'tour-sessions-link',
  },
];

function navClass({ isActive }: { isActive: boolean }) {
  const base =
    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors cursor-pointer';
  return isActive
    ? `${base} bg-blue-600 text-white font-medium`
    : `${base} text-white/90 dark:text-white hover:bg-slate-800 hover:text-white`;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { username, role, isAuthenticated } = useCurrentUser();
  const { startTour, running } = useTour();

  useEffect(() => {
    if (running) setSidebarOpen(true);
  }, [running]);

  useEffect(() => {
    if (!isAuthenticated || role === 'guest') return;
    void ensureSeedData();
  }, [isAuthenticated, role]);

  const visibleItems = role
    ? NAV_ITEMS.filter((item) => item.roles.includes(role))
    : NAV_ITEMS.filter((item) => item.to === '/');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Mobile overlay ────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden cursor-pointer"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col',
          'transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-700 dark:border-slate-700">
          <Shield className="w-8 h-8 text-blue-500 shrink-0" />
          <span className="text-xl font-bold text-white tracking-tight">ИИ-Сторож</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(({ to, Icon, label, tourId }) => (
            <NavLink key={to} id={tourId} to={to} end={to === '/'} className={navClass}>
              <Icon className="w-5 h-5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-700 dark:border-slate-700 p-4 mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{username || 'Гость'}</div>
              <RoleBadge role={role} />
            </div>
          </div>
          {isAuthenticated && role !== 'guest' && (
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(true);
                startTour();
              }}
              className="mb-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm
                         border border-slate-600 text-slate-300 rounded-lg
                         hover:border-blue-500 hover:text-blue-400 transition cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" />
              Пройти обучение
            </button>
          )}
          <div className="mb-3">
            <ThemeToggle />
          </div>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                logout();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-500 hover:text-green-400 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Войти
            </button>
          )}
          <p className="mt-3 text-xs text-slate-500">НЭТИ-НЕКСТ 2026 · Хакатон</p>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-slate-900">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Shield className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800 dark:text-gray-100">ИИ-Сторож</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 text-gray-900 dark:text-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
