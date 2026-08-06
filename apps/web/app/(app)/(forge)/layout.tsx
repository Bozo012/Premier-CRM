import type { ReactNode } from 'react';

interface ForgeLayoutProps {
  children: ReactNode;
}

// Every route under app/(app)/(forge)/ renders the Base44-exact ForgeShell
// itself, internally (see e.g. customers/_components/customers-shell.tsx),
// because each such page needs to fetch its own org/staff/navigation data
// server-side to build the shell's props — there is no shared shellData
// this layout could fetch generically without duplicating that per-route
// work. This layout is therefore a deliberate no-op wrapper: it exists so
// the route-group boundary is explicit and documented, not because it
// renders anything. Do not add chrome here — that would double-wrap every
// (forge) route's own ForgeShell render.
export default function ForgeLayout({ children }: ForgeLayoutProps) {
  return <>{children}</>;
}
