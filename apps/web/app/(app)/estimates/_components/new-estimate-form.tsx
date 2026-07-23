'use client';

import { CustomerPropertyWorkForm } from '@/components/forms/customer-property-work-form';

import { createManualEstimateAction } from '../actions';

export function NewEstimateForm() {
  return (
    <CustomerPropertyWorkForm
      redirectBasePath="/estimates"
      submitAction={async (_prevState, formData) => {
        const result = await createManualEstimateAction(null, formData);
        return result.success ? { success: true, data: { id: result.data.estimateId } } : result;
      }}
      submitIdleLabel="Create estimate"
      submitPendingLabel="Creating…"
      successMessage="Estimate created."
    />
  );
}
