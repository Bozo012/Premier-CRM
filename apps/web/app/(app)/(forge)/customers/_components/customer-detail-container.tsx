'use client'; // Wires the ported RecordDetailView to router navigation (back, related-record links) and the Add property dialog.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { RecordDetailView } from '@/components/forge-shell/RecordDetailView';
import type { RecordDetailCallbacks, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

import { AddPropertyDialog } from './add-property-dialog';

export function CustomerDetailContainer({ customerId, model }: { customerId: string; model: RecordDetailModel }) {
  const router = useRouter();
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);

  const callbacks: RecordDetailCallbacks = {
    onBack: () => router.push('/customers'),
    onOpenRelated: (item) => {
      if (item.route) router.push(item.route);
    },
    onAction: (actionId) => {
      if (actionId === 'add-property') {
        setIsAddPropertyOpen(true);
      }
    },
  };

  return (
    <>
      <RecordDetailView state={{ model, isLoading: false, error: null }} callbacks={callbacks} />
      <AddPropertyDialog customerId={customerId} open={isAddPropertyOpen} onOpenChange={setIsAddPropertyOpen} />
    </>
  );
}
