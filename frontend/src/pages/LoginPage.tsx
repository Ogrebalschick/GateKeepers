import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    try {
      const data = await login(username.trim(), password);

      // Persist session
      localStorage.setItem('guard_token', data.access_token);
      localStorage.setItem('guard_user_id', data.user_id);
      localStorage.setItem('guard_role', data.role);
      localStorage.setItem('guard_username', username.trim());

      toast.success(`Добро пожаловать, ${username.trim()}!`);

      const redirect = searchParams.get('redirect') ?? '/';
      navigate(redirect, { replace: true });
    } catch (err: unknown) {
      const status =
        (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        toast.error('Неверный логин или пароль');
      } else {
        toast.error('Ошибка сервера. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ── Card ── */}
        <div className="bg-white rounded-2xl shadow-lg p-8">

          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-3 select-none">🛡️</div>
            <h1 className="text-2xl font-bold text-gray-900">ИИ-Сторож</h1>
            <p className="text-gray-500 text-sm mt-1">Вход в систему</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Логин
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-400 transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                disabled={loading}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50 disabled:text-gray-400 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                         text-white font-semibold rounded-lg text-sm transition
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Вход…
                </>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
            <p className="font-semibold text-gray-700 mb-2">🎓 Demo credentials (для жюри)</p>
            <table className="w-full">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-medium pb-1">Логин</th>
                  <th className="text-left font-medium pb-1">Пароль</th>
                  <th className="text-left font-medium pb-1">Роль</th>
                </tr>
              </thead>
              <tbody className="font-mono space-y-1">
                <tr>
                  <td className="pr-3 py-0.5">admin</td>
                  <td className="pr-3">demo_admin_2026</td>
                  <td className="text-blue-600">полный доступ</td>
                </tr>
                <tr>
                  <td className="pr-3 py-0.5">sre_user</td>
                  <td className="pr-3">demo_sre_2026</td>
                  <td className="text-green-600">просмотр</td>
                </tr>
                <tr>
                  <td className="pr-3 py-0.5">dev_user</td>
                  <td className="pr-3">demo_dev_2026</td>
                  <td className="text-orange-600">свои данные</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
