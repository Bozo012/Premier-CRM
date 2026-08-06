'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links).

import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

export function CustomerDetailContainer({ model }: { model: RecordDetailModel }) {
  const router = useRouter();

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/customers'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    // No wired actions yet (see forge-customer-detail-view-model.ts) —
    // present so RecordDetailView's contract is satisfied even though the
    // model currently supplies no primary/secondary actions.
    onAction: () => {},
  };

  return <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />;
}
