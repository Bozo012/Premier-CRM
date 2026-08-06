// Adapted from Base44 Forge-Base44-UX @ 497d0693 — src/contracts/team.ts.
// TeamCallbacks trims onNavigate/onQuickAction/onSwitchOrganization/
// onSignOut — those are handled by TeamShell's ForgeShellCallbacks (see
// ../../customers/_components/customers-shell.tsx's precedent), not by the
// list presentation itself. Everything else matches the exact shape the
// ported TeamList presentation component expects.
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  initials: string;
  availability: 'available' | 'on_job' | 'off_shift' | 'on_leave';
  availabilityLabel: string;
  assignedJobs: number;
  skills: string[];
  lastActiveLabel: string;
}

export interface TeamFilter {
  id: string;
  label: string;
  count: number;
}

export interface TeamListViewModel {
  members: TeamMember[];
  searchQuery: string;
  activeFilter: string;
  filters: TeamFilter[];
  isLoading: boolean;
  error: { title: string; message: string } | null;
  // Server-computed (role === 'owner' || role === 'admin'), NOT a
  // client-only decision — controls whether the ported TeamList even
  // offers the "Invite member" trigger. The gated #invite-member section
  // it scrolls to is separately (and correctly) omitted from the DOM for
  // non-managers by page.tsx; this flag closes the matching gap on the
  // trigger button itself, which the ported presentation component has no
  // way to know about on its own (portable components are permission-free
  // by design).
  canInvite: boolean;
}

export interface TeamCallbacks {
  onOpenAction: (action: string, id?: string) => void;
  onOpenMember: (id: string) => void;
  onSearch: (query: string) => void;
  onFilter: (filter: string) => void;
}
