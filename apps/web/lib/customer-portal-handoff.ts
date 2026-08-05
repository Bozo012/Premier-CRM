const DEFAULT_MARKETING_ORIGIN = 'https://www.ppmnky.com';

const STATIC_ALLOWED_MARKETING_ORIGINS = [
  'https://ppmnky.com',
  'https://www.ppmnky.com',
  'https://premier-property-maintenance.vercel.app',
];

const DEV_ALLOWED_MARKETING_ORIGINS = ['http://localhost:5173'];

export type MarketingPortalStatus =
  | 'missing-credentials'
  | 'missing-access-fields'
  | 'password-too-short'
  | 'invalid-credentials'
  | 'account-created-check-email'
  | 'account-link-failed'
  | 'portal-unavailable'
  | 'signed-out';

function normalizeOrigin(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_MARKETING_ORIGIN;
  return trimmed.replace(/\/+$/, '');
}

export function getMarketingOrigin(): string {
  return normalizeOrigin(process.env.NEXT_PUBLIC_MARKETING_SITE_URL);
}

export function buildMarketingPortalUrl(status?: MarketingPortalStatus): string {
  const url = new URL('/customer-portal', getMarketingOrigin());
  if (status) url.searchParams.set('portalStatus', status);
  return url.toString();
}

export function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAllowedPortalHandoffOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const configured = (process.env.PORTAL_HANDOFF_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed =
    process.env.NODE_ENV === 'development'
      ? [...STATIC_ALLOWED_MARKETING_ORIGINS, ...DEV_ALLOWED_MARKETING_ORIGINS, ...configured]
      : [...STATIC_ALLOWED_MARKETING_ORIGINS, ...configured];

  return allowed.includes(origin);
}
