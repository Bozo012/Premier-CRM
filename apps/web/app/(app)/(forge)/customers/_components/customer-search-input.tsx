'use client'; // Client component required for debounced URL updates and useSearchParams.

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Input } from '@/components/ui/input';

interface CustomerSearchInputProps {
  /** Initial value, sourced from the `q` URL search param on the server. */
  defaultValue: string;
  /** Optional placeholder; defaults to a sensible string. */
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

/**
 * Search box for the customers list. Updates the `q` URL search param after
 * the user stops typing for {DEBOUNCE_MS}ms; the page re-renders server-side
 * with the new query. Empty/whitespace input removes the param entirely.
 *
 * URL is the source of truth, so the page is shareable, refresh-safe, and
 * browser-back-friendly. Local state only exists to avoid laggy typing.
 */
export function CustomerSearchInput({
  defaultValue,
  placeholder = 'Search customers by name...',
}: CustomerSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip the URL push on initial mount — value already matches the URL.
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    const handle = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();

      if (trimmed) {
        next.set('q', trimmed);
      } else {
        next.delete('q');
      }

      const newQueryString = next.toString();
      const currentQueryString = searchParams.toString();

      // Skip the push when nothing actually changed. Prevents the effect
      // from re-pushing identical URLs after the searchParams reference
      // updates, which would otherwise re-trigger this same effect.
      if (newQueryString === currentQueryString) return;

      router.replace(
        newQueryString ? `${pathname}?${newQueryString}` : pathname
      );
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value, pathname, router, searchParams]);

  return (
    <Input
      type="search"
      inputMode="search"
      autoComplete="off"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={placeholder}
      aria-label="Search customers"
      className="h-11 w-full"
    />
  );
}
