'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links).

import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

export function PropertyDetailContainer({ model }: { model: RecordDetailModel }) {
  const router = useRouter();

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/properties'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    // No wired actions yet — see forge-property-detail-view-model.ts.
    onAction: () => {},
  };

  return <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />;
}
