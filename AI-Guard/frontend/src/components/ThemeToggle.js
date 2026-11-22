import { jsx as _jsx } from "react/jsx-runtime";
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
const OPTIONS = [
    { mode: 'light', label: 'светлая', Icon: Sun },
    { mode: 'dark', label: 'тёмная', Icon: Moon },
    { mode: 'system', label: 'системная', Icon: Monitor },
];
export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    return (_jsx("div", { className: "grid grid-cols-3 gap-1 rounded-lg bg-slate-800 p-1", role: "group", "aria-label": "\u0422\u0435\u043C\u0430 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F", children: OPTIONS.map(({ mode, label, Icon }) => {
            const active = theme === mode;
            return (_jsx("button", { type: "button", title: label, "aria-pressed": active, "aria-label": `Переключить тему: ${label}`, onClick: () => setTheme(mode), className: [
                    'flex items-center justify-center rounded-md py-1.5 transition cursor-pointer',
                    active
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:bg-slate-700/60 hover:text-white',
                ].join(' '), children: _jsx(Icon, { className: "w-4 h-4" }) }, mode));
        }) }));
}
