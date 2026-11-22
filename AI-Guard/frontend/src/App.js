import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TourProvider } from './components/Tour';
import CheckPage from './pages/CheckPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import LogsPage from './pages/LogsPage';
import PolicyPage from './pages/PolicyPage';
import SessionDetailPage from './pages/SessionDetailPage';
import SessionsPage from './pages/SessionsPage';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    },
});
export default function App() {
    return (_jsx(ErrorBoundary, { children: _jsxs(QueryClientProvider, { client: queryClient, children: [_jsx(BrowserRouter, { children: _jsx(TourProvider, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { path: "/", element: _jsx(CheckPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/logs", element: _jsx(ProtectedRoute, { children: _jsx(LogsPage, {}) }) }), _jsx(Route, { path: "/policy", element: _jsx(ProtectedRoute, { children: _jsx(PolicyPage, {}) }) }), _jsx(Route, { path: "/sessions", element: _jsx(ProtectedRoute, { children: _jsx(SessionsPage, {}) }) }), _jsx(Route, { path: "/sessions/:sessionId", element: _jsx(ProtectedRoute, { children: _jsx(SessionDetailPage, {}) }) })] })] }) }) }), _jsx(Toaster, { position: "top-right" })] }) }));
}
