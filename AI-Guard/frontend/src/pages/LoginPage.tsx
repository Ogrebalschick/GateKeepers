import { ArrowRight, Eye, EyeOff, GraduationCap, Loader2, Shield } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { login } from '../services/api';

const DEMO_ACCOUNTS = [
  {
    username: 'admin',
    password: 'demo_admin_2026',
    role: 'admin',
    access: 'полный доступ',
    accessClass: 'text-blue-600',
  },
  {
    username: 'sre_user',
    password: 'demo_sre_2026',
    role: 'SRE',
    access: 'просмотр',
    accessClass: 'text-green-600',
  },
  {
    username: 'dev_user',
    password: 'demo_dev_2026',
    role: 'developer',
    access: 'свои данные',
    accessClass: 'text-orange-600',
  },
] as const;

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useCurrentUser();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(account.username);
    setPassword(account.password);
    toast.success(`Данные аккаунта ${account.role} подставлены`);
  }

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
      const status = (err as { response?: { status?: number } })?.response?.status;
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
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ── Card ── */}
        <div className="bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-2xl shadow-lg p-8">
          {/* Logo + Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-3">
              <Shield className="w-14 h-14 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ИИ-Сторож</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Вход в систему</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
              >
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
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm
                           bg-white dark:bg-slate-800 text-gray-900 dark:text-white
                           placeholder:text-gray-400 dark:placeholder:text-gray-500
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:bg-gray-50 dark:disabled:bg-slate-900 disabled:text-gray-400 dark:disabled:text-gray-500 transition"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
              >
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  disabled={loading}
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm
                             bg-white dark:bg-slate-800 text-gray-900 dark:text-white
                             placeholder:text-gray-400 dark:placeholder:text-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             disabled:bg-gray-50 dark:disabled:bg-slate-900 disabled:text-gray-400 dark:disabled:text-gray-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={loading}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500
                             hover:opacity-70 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400
                         text-white font-semibold rounded-lg text-sm transition
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4" />
                  Вход…
                </>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          {!isAuthenticated && (
            <div className="mt-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
                <span className="text-xs text-gray-400 dark:text-gray-500">или</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-slate-700" />
              </div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2.5 px-4 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-gray-300
                           hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Продолжить как гость
              </button>
            </div>
          )}

          {/* Demo credentials hint */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-gray-300">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4" />
              Demo credentials (для жюри)
            </p>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto_1rem] gap-x-3 px-2 pb-1 text-gray-500 dark:text-gray-400 font-medium">
              <span>Логин</span>
              <span>Пароль</span>
              <span>Роль</span>
              <span />
            </div>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  disabled={loading}
                  onClick={() => fillDemo(account)}
                  className="w-full grid grid-cols-[5.5rem_minmax(0,1fr)_auto_1rem] gap-x-3 items-center
                             text-left px-2 py-1.5 rounded-md font-mono cursor-pointer
                             hover:bg-white dark:hover:bg-slate-600 transition disabled:cursor-not-allowed"
                >
                  <span className="text-gray-800 dark:text-gray-100">{account.username}</span>
                  <span className="text-gray-800 dark:text-gray-100">{account.password}</span>
                  <span className={`font-sans ${account.accessClass}`}>{account.access}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
