// Nav structure per the Base44 customer-portal-presentation-boundary doc:
// desktop sidebar = Home, Messages, Requests, Quotes, Change orders,
// Invoices, Properties, Appointments, Account. Mobile = 4 primary (Home,
// Messages, Requests, More) + a More sheet for the rest. "Change orders"
// and "Appointments" route to real, already-built sections on the Home
// job cards (per-job change-order threads and scheduling-slot booking) —
// there is no standalone change-order/appointment list model in the real
// schema independent of a job, so those two nav entries deep-link to Home
// rather than duplicating a second, thinner listing page.
export interface PortalNavLink {
  href: string;
  id: string;
  label: string;
  primary: boolean;
}

export const PORTAL_NAV_LINKS: PortalNavLink[] = [
  { href: '/portal/dashboard', id: 'home', label: 'Home', primary: true },
  { href: '/portal/messages', id: 'messages', label: 'Messages', primary: true },
  { href: '/portal/requests', id: 'requests', label: 'Requests', primary: true },
  { href: '/portal/quotes', id: 'quotes', label: 'Quotes', primary: false },
  { href: '/portal/dashboard#jobs', id: 'change-orders', label: 'Change orders', primary: false },
  { href: '/portal/invoices', id: 'invoices', label: 'Invoices', primary: false },
  { href: '/portal/properties', id: 'properties', label: 'Properties', primary: false },
  { href: '/portal/dashboard#jobs', id: 'appointments', label: 'Appointments', primary: false },
  { href: '/portal/account', id: 'account', label: 'Account', primary: false },
];
