'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links).

import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

export function TeamMemberDetailContainer({ model }: { model: RecordDetailModel }) {
  const router = useRouter();

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/team'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    onAction: () => {},
  };

  return <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />;
}
