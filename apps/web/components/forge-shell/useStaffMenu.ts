'use client'; // Local open/focus/breakpoint state for the shared staff-menu controller.

// Ported verbatim (logic unchanged) from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/shared/useStaffMenu.ts.
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One shared staff-menu controller for the whole header.
 *
 * Desktop and mobile render different presentation surfaces, but they share this
 * single open state and a single action contract, so a click can never open two
 * stacked overlays and a viewport change can never leave a hidden overlay mounted.
 */
export function useStaffMenu() {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const desktopTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  /** Return focus to whichever trigger belongs to the surface now on screen. */
  const focusTrigger = useCallback(() => {
    const target = isDesktop ? desktopTriggerRef.current : mobileTriggerRef.current;
    target?.focus();
  }, [isDesktop]);

  const close = useCallback(
    (options?: { restoreFocus?: boolean }) => {
      setOpen(false);
      if (options?.restoreFocus !== false) requestAnimationFrame(() => focusTrigger());
    },
    [focusTrigger]
  );

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  /** Run a supplied presentation action, then close the single menu. */
  const runAndClose = useCallback(
    (action: () => void) => {
      action();
      close();
    },
    [close]
  );

  return { open, setOpen, isDesktop, toggle, close, runAndClose, desktopTriggerRef, mobileTriggerRef, menuId: 'forge-staff-menu' };
}
