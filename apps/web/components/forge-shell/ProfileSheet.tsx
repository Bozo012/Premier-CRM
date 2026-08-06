'use client'; // Sheet open state and callbacks passed down from the header.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/ProfileSheet.tsx. Markup unchanged; the
// `forge-today`/`forge-dark` wrapper classes Base44 needed (to scope its
// own CSS variables per-instance) are dropped since this app's tokens are
// already applied globally via app/globals.css + the .dark class — no
// per-component theme scoping is needed here.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

import { StaffMenuPanel } from './StaffMenuPanel';
import type { ForgeShellCallbacks, ForgeShellData } from './types';

/**
 * Mobile / tablet presentation surface for the shared staff menu. Controlled by the
 * single staff-menu controller and mounted only below the desktop breakpoint, so no
 * desktop dropdown can sit stacked behind it.
 */
export function ProfileSheet({
  id,
  open,
  onOpenChange,
  data,
  callbacks,
  onAction,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ForgeShellData;
  callbacks: ForgeShellCallbacks;
  onAction: (action: () => void) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={id}
        side="bottom"
        className="z-50 flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-border bg-card p-0 pb-[max(1rem,env(safe-area-inset-bottom))] text-card-foreground"
      >
        <SheetHeader className="space-y-1 border-b border-border px-5 pt-5 text-left">
          <SheetTitle className="text-base font-bold text-card-foreground">{data.staff.displayName}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">{data.staff.email}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <StaffMenuPanel data={data} callbacks={callbacks} onAction={onAction} showIdentity={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
