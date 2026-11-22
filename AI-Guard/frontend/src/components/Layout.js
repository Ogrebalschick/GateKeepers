import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart3, FileText, GraduationCap, LogIn, LogOut, Menu, MessageSquare, Search, Settings, Shield, User, } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { ensureSeedData, logout } from '../services/api';
import { RoleBadge } from './RoleBadge';
import { ThemeToggle } from './ThemeToggle';
import { useTour } from './Tour';
const NAV_ITEMS = [
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
function navClass({ isActive }) {
    const base = 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors cursor-pointer';
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
        if (running)
            setSidebarOpen(true);
    }, [running]);
    useEffect(() => {
        if (!isAuthenticated || role === 'guest')
            return;
        void ensureSeedData();
    }, [isAuthenticated, role]);
    const visibleItems = role
        ? NAV_ITEMS.filter((item) => item.roles.includes(role))
        : NAV_ITEMS.filter((item) => item.to === '/');
    return (_jsxs("div", { className: "flex h-screen overflow-hidden", children: [sidebarOpen && (_jsx("div", { className: "fixed inset-0 z-20 bg-black/50 md:hidden cursor-pointer", onClick: () => setSidebarOpen(false) })), _jsxs("aside", { className: [
                    'fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col',
                    'transition-transform duration-200',
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full',
                    'md:static md:translate-x-0',
                ].join(' '), children: [_jsxs("div", { className: "flex items-center gap-2 px-5 py-5 border-b border-slate-700 dark:border-slate-700", children: [_jsx(Shield, { className: "w-8 h-8 text-blue-500 shrink-0" }), _jsx("span", { className: "text-xl font-bold text-white tracking-tight", children: "\u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436" })] }), _jsx("nav", { className: "flex-1 px-3 py-4 space-y-1 overflow-y-auto", children: visibleItems.map(({ to, Icon, label, tourId }) => (_jsxs(NavLink, { id: tourId, to: to, end: to === '/', className: navClass, children: [_jsx(Icon, { className: "w-5 h-5 shrink-0" }), _jsx("span", { children: label })] }, to))) }), _jsxs("div", { className: "border-t border-gray-700 dark:border-slate-700 p-4 mt-auto", children: [_jsxs("div", { className: "flex items-center gap-3 mb-3", children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center", children: _jsx(User, { className: "w-4 h-4 text-white" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-white truncate", children: username || 'Гость' }), _jsx(RoleBadge, { role: role })] })] }), isAuthenticated && role !== 'guest' && (_jsxs("button", { type: "button", onClick: () => {
                                    setSidebarOpen(true);
                                    startTour();
                                }, className: "mb-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm\n                         border border-slate-600 text-slate-300 rounded-lg\n                         hover:border-blue-500 hover:text-blue-400 transition cursor-pointer", children: [_jsx(GraduationCap, { className: "w-4 h-4" }), "\u041F\u0440\u043E\u0439\u0442\u0438 \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435"] })), _jsx("div", { className: "mb-3", children: _jsx(ThemeToggle, {}) }), isAuthenticated ? (_jsxs("button", { type: "button", onClick: () => {
                                    logout();
                                }, className: "w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer", children: [_jsx(LogOut, { className: "w-4 h-4" }), "\u0412\u044B\u0439\u0442\u0438"] })) : (_jsxs("button", { type: "button", onClick: () => navigate('/login'), className: "w-full flex items-center gap-2 px-3 py-2 text-sm text-green-500 hover:text-green-400 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer", children: [_jsx(LogIn, { className: "w-4 h-4" }), "\u0412\u043E\u0439\u0442\u0438"] })), _jsx("p", { className: "mt-3 text-xs text-slate-500", children: "\u041D\u042D\u0422\u0418-\u041D\u0415\u041A\u0421\u0422 2026 \u00B7 \u0425\u0430\u043A\u0430\u0442\u043E\u043D" })] })] }), _jsxs("div", { className: "flex flex-1 flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-slate-900", children: [_jsxs("header", { className: "md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm", children: [_jsx("button", { onClick: () => setSidebarOpen((v) => !v), className: "p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors cursor-pointer", "aria-label": "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E", children: _jsx(Menu, { className: "w-5 h-5" }) }), _jsx(Shield, { className: "w-5 h-5 text-blue-600" }), _jsx("span", { className: "font-semibold text-gray-800 dark:text-gray-100", children: "\u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436" })] }), _jsx("main", { className: "flex-1 overflow-auto p-6 text-gray-900 dark:text-gray-100", children: _jsx(Outlet, {}) })] })] }));
}
