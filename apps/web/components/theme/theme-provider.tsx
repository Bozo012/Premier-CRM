'use client';

// Forge-owned appearance preference (Forge V1.1 UX modernization — Base44
// Today visual integration). Single application-wide mechanism: Light /
// Dark / System, defaulting to System, persisted client-side only (no
// database/Supabase/backend involvement). Replaces Base44's Today-local
// `useForgeAppearance` hook (localStorage key `forge-presentation-appearance`,
// scoped to one route) with one shell-level provider every route shares —
// see docs/ux/base44-today-sync-and-portability-audit.md for the finding
// that made this necessary.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'forge-appearance';

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyResolvedTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeContextValue {
  appearance: Appearance;
  resolvedTheme: 'light' | 'dark';
  setAppearance: (value: Appearance) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial value mirrors the anti-flash inline script in app/layout.tsx —
  // both read the same storage key/default so hydration matches what the
  // script already painted before React mounted.
  const [appearance, setAppearanceState] = useState<Appearance>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(resolveSystemTheme);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = appearance === 'system' ? systemTheme : appearance;

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setAppearance = useCallback((value: Appearance) => {
    setAppearanceState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore — appearance falls back to System on the next load */
    }
  }, []);

  const value = useMemo(() => ({ appearance, resolvedTheme, setAppearance }), [appearance, resolvedTheme, setAppearance]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

// Inlined verbatim into app/layout.tsx's <head> as a blocking script so the
// `dark` class is applied before first paint — avoids the light->dark flash
// a purely-client-side provider would otherwise cause on reload.
export const THEME_ANTI_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
