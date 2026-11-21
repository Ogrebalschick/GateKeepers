import { Monitor, Moon, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTheme, type ThemeMode } from '../hooks/useTheme';

const OPTIONS: { mode: ThemeMode; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { mode: 'light', label: 'светлая', Icon: Sun },
  { mode: 'dark', label: 'тёмная', Icon: Moon },
  { mode: 'system', label: 'системная', Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-lg bg-slate-800 p-1"
      role="group"
      aria-label="Тема оформления"
    >
      {OPTIONS.map(({ mode, label, Icon }) => {
        const active = theme === mode;
        return (
          <button
            key={mode}
            type="button"
            title={label}
            aria-pressed={active}
            aria-label={`Переключить тему: ${label}`}
            onClick={() => setTheme(mode)}
            className={[
              'flex items-center justify-center rounded-md py-1.5 transition cursor-pointer',
              active
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-700/60 hover:text-white',
            ].join(' ')}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
