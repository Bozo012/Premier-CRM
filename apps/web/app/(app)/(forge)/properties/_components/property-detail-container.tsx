'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links).

import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

export function PropertyDetailContainer({ model, mapsUrl }: { model: RecordDetailModel; mapsUrl: string | null }) {
  const router = useRouter();

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/properties'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    // Real, address-driven "View on map" link-out (routing/map slice,
    // Phase 14) — opens the key-free Google Maps universal search URL for
    // this property's real address in a new tab; a no-op only when the
    // property truly has no usable address at all.
    onAction: (actionId) => {
      if (actionId === 'view-on-map' && mapsUrl) window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    },
  };

  return <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />;
}
