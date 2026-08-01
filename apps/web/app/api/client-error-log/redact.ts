import { getAppUrl } from '@/lib/email';

// Strips email addresses, bearer/JWT-shaped tokens, and long opaque
// alphanumeric tokens before anything is persisted to logs — a stack
// trace can capture a token in a closure variable name or URL.
export function redact(value: string): string {
  return value
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]')
    .replace(/[A-Za-z0-9_-]{24,}/g, '[redacted-token]');
}

// Only keeps a same-origin pathname — never logs a caller-supplied
// absolute URL to a different host verbatim.
export function safePathname(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;

  if (rawUrl.startsWith('/')) {
    return rawUrl.slice(0, 300);
  }

  try {
    const parsed = new URL(rawUrl);
    const appOrigin = new URL(getAppUrl()).origin;
    if (parsed.origin !== appOrigin) return null;
    return parsed.pathname.slice(0, 300);
  } catch {
    return null;
  }
}
