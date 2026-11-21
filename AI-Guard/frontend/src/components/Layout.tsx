import {
  BarChart3,
  FileText,
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
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { logout } from '../services/api';
import { RoleBadge } from './RoleBadge';

interface NavItem {
  to: string;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', Icon: Search, label: 'Проверить', roles: ['admin', 'sre', 'developer'] },
  { to: '/dashboard', Icon: BarChart3, label: 'Дашборд', roles: ['admin', 'sre'] },
  { to: '/logs', Icon: FileText, label: 'Журнал', roles: ['admin', 'sre', 'developer'] },
  { to: '/policy', Icon: Settings, label: 'Политика', roles: ['admin', 'sre'] },
  { to: '/sessions', Icon: MessageSquare, label: 'Сессии', roles: ['admin', 'sre', 'developer'] },
];

function navClass({ isActive }: { isActive: boolean }) {
  const base =
    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors cursor-pointer';
  return isActive
    ? `${base} bg-blue-600 text-white font-medium`
    : `${base} text-slate-300 hover:bg-slate-800 hover:text-white`;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { username, role, isAuthenticated } = useCurrentUser();
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
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-700">
          <Shield className="w-8 h-8 text-blue-500 shrink-0" />
          <span className="text-xl font-bold text-white tracking-tight">ИИ-Сторож</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(({ to, Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={navClass}>
              <Icon className="w-5 h-5 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-700 p-4 mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{username || 'Гость'}</div>
              <RoleBadge role={role} />
            </div>
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
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-gray-50">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Shield className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800">ИИ-Сторож</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
