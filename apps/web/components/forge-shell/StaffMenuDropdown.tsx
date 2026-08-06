'use client'; // Focus management + outside-click/escape listeners.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/StaffMenuDropdown.tsx. Logic and markup
// unchanged; typed against ForgeShellData/ForgeShellCallbacks.
import { useEffect, useRef } from 'react';

import { StaffMenuPanel } from './StaffMenuPanel';
import type { ForgeShellCallbacks, ForgeShellData } from './types';

/**
 * Desktop presentation surface for the shared staff menu. Mounted only while the
 * desktop breakpoint is active, anchored to the avatar trigger.
 */
export function StaffMenuDropdown({
  id,
  data,
  callbacks,
  onAction,
  onClose,
  triggerRef,
}: {
  id: string;
  data: ForgeShellData;
  callbacks: ForgeShellCallbacks;
  onAction: (action: () => void) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button, select')?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose, triggerRef]);

  return (
    <div
      ref={panelRef}
      id={id}
      role="menu"
      aria-label={`Staff menu for ${data.staff.displayName}`}
      className="absolute right-0 top-full z-50 mt-2 max-h-[80vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground shadow-xl"
    >
      <StaffMenuPanel data={data} callbacks={callbacks} onAction={onAction} />
    </div>
  );
}
