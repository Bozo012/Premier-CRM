'use client'; // Reads/writes theme state via useTheme(), and needs onClick handlers.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/ThemeControl.tsx. Presentation and interaction
// pattern unchanged (three-way toggle, aria-pressed, icon+label, compact
// variant for the mobile header). Bound here to Premier-CRM's EXISTING
// Forge ThemeProvider (apps/web/components/theme/theme-provider.tsx,
// already shipped from a prior Today integration) instead of Base44's
// route-local `useForgeAppearance` hook (localStorage key
// `forge-presentation-appearance`) — that hook is intentionally not
// ported; see apps/web/components/theme/theme-control.tsx for the
// pre-existing non-compact ThemeControl this app already had. This
// forge-shell version adds the `compact` variant Base44's header needs and
// is what forge-shell's own header actually renders.
import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type Appearance } from '@/components/theme/theme-provider';

const options: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { appearance, setAppearance } = useTheme();

  if (compact) {
    return (
      <div role="group" aria-label="Appearance" className="flex items-center rounded-full border border-border bg-muted p-0.5">
        {options.map(({ value, label, Icon }) => {
          const active = appearance === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setAppearance(value)}
              aria-pressed={active}
              aria-label={`${label} appearance`}
              className={`grid h-8 w-8 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="group" aria-label="Appearance" className="flex items-center gap-0.5 rounded-xl border border-border bg-muted p-0.5">
      {options.map(({ value, label, Icon }) => {
        const active = appearance === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setAppearance(value)}
            aria-pressed={active}
            aria-label={`${label} appearance`}
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
