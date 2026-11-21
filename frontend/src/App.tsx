import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components';
import CheckPage from './pages/CheckPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import LogsPage from './pages/LogsPage';
import PolicyPage from './pages/PolicyPage';
import SessionsPage from './pages/SessionsPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Login — без Layout */}
          <Route path="/login" element={<LoginPage />} />

          {/* Все страницы — внутри Layout */}
          <Route element={<Layout />}>
            <Route path="/" element={<CheckPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/policy" element={<PolicyPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
