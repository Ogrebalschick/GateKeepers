import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TourProvider } from './components/Tour';
import ChatPage from './pages/ChatPage';
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
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TourProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/check" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/chat" element={<ChatPage />} />

              <Route element={<Layout />}>
                <Route path="/check" element={<CheckPage />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/logs"
                  element={
                    <ProtectedRoute>
                      <LogsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/policy"
                  element={
                    <ProtectedRoute>
                      <PolicyPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sessions"
                  element={
                    <ProtectedRoute>
                      <SessionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sessions/:sessionId"
                  element={
                    <ProtectedRoute>
                      <SessionDetailPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/check" replace />} />
            </Routes>
          </TourProvider>
        </BrowserRouter>
        <Toaster position="top-right" />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
