'use client';

// Adapted from the Base44 Today workspace's ThemeControl.tsx (Bozo012/Forge-Base44-UX
// @ adee72e, src/components/forge/today/ThemeControl.tsx) — presentation
// only, unchanged interaction pattern (three-way toggle, aria-pressed,
// icon+label). Bound here to Forge's own useTheme() instead of Base44's
// local useForgeAppearance() hook, which is not ported (see
// docs/ux/base44-today-sync-and-portability-audit.md).
import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme, type Appearance } from './theme-provider';

const OPTIONS: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function ThemeControl({ className }: { className?: string }) {
  const { appearance, setAppearance } = useTheme();

  return (
    <div role="group" aria-label="Appearance" className={cn('flex items-center gap-0.5 rounded-xl border bg-muted p-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = appearance === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setAppearance(value)}
            aria-pressed={active}
            aria-label={`${label} appearance`}
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
