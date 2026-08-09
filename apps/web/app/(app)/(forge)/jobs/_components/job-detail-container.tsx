'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links).

import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

export function JobDetailContainer({ model }: { model: RecordDetailModel }) {
  const router = useRouter();

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/jobs'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    onAction: () => {
      // No secondaryActions are supplied for Job Detail (see
      // forge-job-detail-view-model.ts's doc comment) — every real trigger
      // point is a bespoke Card/button rendered alongside this component,
      // not an actionId routed through here.
    },
  };

  return <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />;
}
