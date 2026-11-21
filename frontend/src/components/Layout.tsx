import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',         icon: '🔍', label: 'Проверить' },
  { to: '/logs',     icon: '📋', label: 'Журнал'    },
  { to: '/policy',   icon: '⚙️',  label: 'Политика'  },
  { to: '/sessions', icon: '💬', label: 'Сессии'    },
];

// NavLink className helper
function navClass({ isActive }: { isActive: boolean }) {
  const base = 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors';
  return isActive
    ? `${base} bg-blue-600 text-white font-medium`
    : `${base} text-slate-300 hover:bg-slate-800 hover:text-white`;
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Mobile overlay ────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
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
          <span className="text-2xl select-none">🛡️</span>
          <span className="text-xl font-bold text-white tracking-tight">ИИ-Сторож</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} className={navClass}>
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
          НЭТИ-НЕКСТ 2026 · Хакатон
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-gray-50">
        {/* Mobile header with hamburger */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Открыть меню"
          >
            {/* Hamburger icon */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-gray-800">🛡️ ИИ-Сторож</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
