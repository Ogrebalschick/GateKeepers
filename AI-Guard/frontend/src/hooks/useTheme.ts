import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'guard_theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

export function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage can be blocked
  }
  return 'system';
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readTheme()),
  );

  useEffect(() => {
    setResolvedTheme(applyTheme(theme));

    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolvedTheme(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore quota / private mode
    }
    setThemeState(mode);
  }, []);

  return { theme, setTheme, resolvedTheme };
}
