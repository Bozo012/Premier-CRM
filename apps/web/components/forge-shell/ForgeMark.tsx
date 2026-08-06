// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/ForgeMark.tsx. Unchanged markup; `forge-*`
// Tailwind classes swapped for Premier-CRM's existing shadcn-style tokens
// (bg-primary/text-primary-foreground, text-nav-active-foreground), which
// already carry the identical HSL palette values Base44's forge-today.css
// defines — see apps/web/app/globals.css. No new CSS/Tailwind config was
// needed for this component.
import { Flame } from 'lucide-react';

export function ForgeMark() {
  return (
    <div className="flex items-center gap-2.5" aria-label="Forge">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Flame className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-xl font-bold tracking-tight text-nav-active-foreground">Forge</span>
    </div>
  );
}
