import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, Eye, EyeOff, GraduationCap, Loader2, Shield } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { login } from '../services/api';
function safeInternalPath(value) {
    if (value && value.startsWith('/') && !value.startsWith('//'))
        return value;
    return '/check';
}
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
];
export default function LoginPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const { isAuthenticated } = useCurrentUser();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    function fillDemo(account) {
        setUsername(account.username);
        setPassword(account.password);
        toast.success(`Данные аккаунта ${account.role} подставлены`);
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!username.trim() || !password)
            return;
        setLoading(true);
        try {
            const data = await login(username.trim(), password);
            // Persist session
            localStorage.setItem('guard_token', data.access_token);
            localStorage.setItem('guard_user_id', data.user_id);
            localStorage.setItem('guard_role', data.role);
            localStorage.setItem('guard_username', username.trim());
            toast.success(`Добро пожаловать, ${username.trim()}!`);
            await queryClient.invalidateQueries({ queryKey: ['sessions'] });
            navigate(safeInternalPath(searchParams.get('redirect')), { replace: true });
        }
        catch (err) {
            const status = err?.response?.status;
            if (status === 401) {
                toast.error('Неверный логин или пароль');
            }
            else {
                toast.error('Ошибка сервера. Попробуйте позже.');
            }
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center p-4", children: _jsx("div", { className: "w-full max-w-md", children: _jsxs("div", { className: "bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-2xl shadow-lg p-8", children: [_jsxs("div", { className: "text-center mb-8", children: [_jsx("div", { className: "flex justify-center mb-3", children: _jsx(Shield, { className: "w-14 h-14 text-blue-600" }) }), _jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white", children: "\u0418\u0418-\u0421\u0442\u043E\u0440\u043E\u0436" }), _jsx("p", { className: "text-gray-500 dark:text-gray-400 text-sm mt-1", children: "\u0412\u0445\u043E\u0434 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0443" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-5", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "username", className: "block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1", children: "\u041B\u043E\u0433\u0438\u043D" }), _jsx("input", { id: "username", type: "text", autoComplete: "username", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "admin", required: true, disabled: loading, className: "w-full px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm\n                           bg-white dark:bg-slate-800 text-gray-900 dark:text-white\n                           placeholder:text-gray-400 dark:placeholder:text-gray-500\n                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent\n                           disabled:bg-gray-50 dark:disabled:bg-slate-900 disabled:text-gray-400 dark:disabled:text-gray-500 transition" })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "password", className: "block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1", children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsxs("div", { className: "relative", children: [_jsx("input", { id: "password", type: showPassword ? 'text' : 'password', autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", required: true, disabled: loading, className: "w-full pl-4 pr-10 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm\n                             bg-white dark:bg-slate-800 text-gray-900 dark:text-white\n                             placeholder:text-gray-400 dark:placeholder:text-gray-500\n                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent\n                             disabled:bg-gray-50 dark:disabled:bg-slate-900 disabled:text-gray-400 dark:disabled:text-gray-500 transition" }), _jsx("button", { type: "button", onClick: () => setShowPassword((visible) => !visible), disabled: loading, "aria-label": showPassword ? 'Скрыть пароль' : 'Показать пароль', className: "absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500\n                             hover:opacity-70 transition cursor-pointer disabled:cursor-not-allowed", children: showPassword ? _jsx(EyeOff, { className: "w-4 h-4" }) : _jsx(Eye, { className: "w-4 h-4" }) })] })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400\n                         text-white font-semibold rounded-lg text-sm transition\n                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2\n                         flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed", children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "animate-spin h-4 w-4" }), "\u0412\u0445\u043E\u0434\u2026"] })) : ('Войти') })] }), !isAuthenticated && (_jsxs("div", { className: "mt-5", children: [_jsxs("div", { className: "flex items-center gap-3 mb-4", children: [_jsx("div", { className: "h-px flex-1 bg-gray-200 dark:bg-slate-700" }), _jsx("span", { className: "text-xs text-gray-400 dark:text-gray-500", children: "\u0438\u043B\u0438" }), _jsx("div", { className: "h-px flex-1 bg-gray-200 dark:bg-slate-700" })] }), _jsx("button", { type: "button", onClick: () => navigate('/'), className: "w-full py-2.5 px-4 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-600 dark:text-gray-300\n                           hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition cursor-pointer", children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u043A\u0430\u043A \u0433\u043E\u0441\u0442\u044C" })] })), _jsxs("div", { className: "mt-6 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-gray-600 dark:text-gray-300", children: [_jsxs("p", { className: "font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-1.5", children: [_jsx(GraduationCap, { className: "w-4 h-4" }), "Demo credentials (\u0434\u043B\u044F \u0436\u044E\u0440\u0438)"] }), _jsxs("div", { className: "grid grid-cols-[5.5rem_minmax(0,1fr)_auto_1rem] gap-x-3 px-2 pb-1 text-gray-500 dark:text-gray-400 font-medium", children: [_jsx("span", { children: "\u041B\u043E\u0433\u0438\u043D" }), _jsx("span", { children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsx("span", { children: "\u0420\u043E\u043B\u044C" }), _jsx("span", {})] }), _jsx("div", { className: "space-y-1", children: DEMO_ACCOUNTS.map((account) => (_jsxs("button", { type: "button", disabled: loading, onClick: () => fillDemo(account), className: "w-full grid grid-cols-[5.5rem_minmax(0,1fr)_auto_1rem] gap-x-3 items-center\n                             text-left px-2 py-1.5 rounded-md font-mono cursor-pointer\n                             hover:bg-white dark:hover:bg-slate-600 transition disabled:cursor-not-allowed", children: [_jsx("span", { className: "text-gray-800 dark:text-gray-100", children: account.username }), _jsx("span", { className: "text-gray-800 dark:text-gray-100", children: account.password }), _jsx("span", { className: `font-sans ${account.accessClass}`, children: account.access }), _jsx(ArrowRight, { className: "w-3.5 h-3.5 text-gray-400 dark:text-gray-500" })] }, account.username))) })] })] }) }) }));
}
