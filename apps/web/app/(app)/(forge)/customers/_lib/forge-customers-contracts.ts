// Ported from Base44 Forge-Base44-UX @ 497d0693 — src/contracts/customers.ts,
// unchanged. This is the exact prop/view-model shape the ported CustomersList
// presentation component (_components/customers-list.tsx) expects — the
// adapter in forge-customers-view-model.ts is responsible for producing it
// from real Forge query results.
export interface CustomerProperty {
  id: string;
  name: string;
  address: string;
  type: 'residential' | 'commercial';
  typeLabel: string;
}

export interface CustomerAction {
  id: string;
  label: string;
  kind?: 'primary' | 'secondary';
}

export interface CustomerSummary {
  id: string;
  name: string;
  status: 'active' | 'prospect' | 'inactive';
  statusLabel: string;
  phone: string;
  email: string;
  properties: CustomerProperty[];
  openRequests: number;
  openEstimates: number;
  lastActivityLabel: string;
  nextActionLabel: string;
  nextActionId: string;
  availableActions: CustomerAction[];
}

export interface CustomerFilter {
  id: string;
  label: string;
  count: number;
}

export interface CustomersListViewModel {
  customers: CustomerSummary[];
  searchQuery: string;
  activeFilter: string;
  filters: CustomerFilter[];
  isLoading: boolean;
  error: { title: string; message: string } | null;
}

export interface CustomerCallbacks {
  onOpenAction: (action: string, id?: string) => void;
  onOpenCustomer: (id: string) => void;
  onSearch: (query: string) => void;
  onFilter: (filter: string) => void;
}
