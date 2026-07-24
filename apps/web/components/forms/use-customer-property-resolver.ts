// Shared customer/property resolution logic for standalone creation flows
// (New Estimate, New Quote, New Job). Extracted from customer-property-work-form.tsx
// so different surfaces can present this exact search/dedupe/property logic in
// different layouts without duplicating it.

import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { CustomerEmailMatch } from '@premier/db';

import {
  checkCustomerEmailAction,
  createCustomerAction,
  createPropertyForCustomerAction,
} from '@/app/(app)/customers/actions';
import {
  listPropertiesForCustomerAction,
  searchCustomersForPickerAction,
  type CustomerPickerItem,
  type PropertyPickerItem,
} from '@/app/(app)/estimates/actions';

export interface ResolvedCustomer {
  displayName: string;
  id: string;
}

export const PROPERTY_TYPE_OPTIONS = [
  { label: 'Not set', value: '' },
  { label: 'Single family', value: 'single_family' },
  { label: 'Rental house', value: 'rental_house' },
  { label: 'Rental unit', value: 'rental_unit' },
  { label: 'Multi-family', value: 'multi_family' },
  { label: 'Commercial', value: 'commercial' },
  { label: 'Other', value: 'other' },
];

/**
 * Builds a FormData from a plain container's named inputs. Used instead of
 * `new FormData(formElement)` for the manual-entry and add-property
 * sections, which are `<div>`s (not `<form>`s) — nesting a real `<form>`
 * inside the page's outer work-details `<form>` is invalid HTML, and
 * browsers resolve it by falling back to a native top-level submission
 * (a full page GET with every field serialized into the URL), silently
 * wiping all React state instead of running the submit handler.
 */
function formDataFromContainer(container: HTMLElement): FormData {
  const formData = new FormData();
  const elements = container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input[name], select[name], textarea[name]'
  );
  elements.forEach((element) => {
    formData.set(element.name, element.value);
  });
  return formData;
}

function computeDisplayName(formData: FormData): string {
  const companyName = String(formData.get('companyName') ?? '').trim();
  if (companyName) return companyName;
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Unnamed customer';
}

export function useCustomerPropertyResolver() {
  // Which way staff is resolving the customer, and the end result once resolved.
  const [customerMode, setCustomerMode] = useState<'search' | 'manual'>('search');
  const [resolvedCustomer, setResolvedCustomer] = useState<ResolvedCustomer | null>(null);

  // Search-mode state
  const [isSearching, startSearch] = useTransition();
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerPickerItem[]>([]);
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Manual-mode state
  const manualContainerRef = useRef<HTMLDivElement>(null);
  const [isResolvingManual, startResolveManual] = useTransition();
  const [manualDuplicateMatch, setManualDuplicateMatch] = useState<CustomerEmailMatch | null>(null);
  const [manualPendingFormData, setManualPendingFormData] = useState<FormData | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  // Property resolution — used whenever the resolved customer already
  // existed (via search, or "use existing" from a dedupe match) and we need
  // to pick or add a property for them. Skipped entirely when a brand-new
  // customer+property were just created together in manual mode.
  const [properties, setProperties] = useState<PropertyPickerItem[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [isLoadingProps, startLoadProps] = useTransition();
  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const addPropertyContainerRef = useRef<HTMLDivElement>(null);
  const [isAddingPropertySubmit, startAddProperty] = useTransition();
  const [addPropertyError, setAddPropertyError] = useState<string | null>(null);

  function loadPropertiesFor(customerId: string) {
    const fd = new FormData();
    fd.set('customerId', customerId);
    startLoadProps(async () => {
      const result = await listPropertiesForCustomerAction(null, fd);
      if (result.success) {
        setProperties(result.data);
        if (result.data.length === 1 && result.data[0]) {
          setSelectedPropertyId(result.data[0].id);
        }
      } else {
        toast.error(result.error ?? 'Could not load properties.');
      }
    });
  }

  function resetCustomer() {
    setResolvedCustomer(null);
    setSelectedPropertyId('');
    setProperties([]);
    setIsAddingProperty(false);
    setSearchAttempted(false);
    setCustomers([]);
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    setManualError(null);
  }

  // ---- Search mode ----

  const handleSearch = () => {
    const fd = new FormData();
    fd.set('q', query);
    startSearch(async () => {
      const result = await searchCustomersForPickerAction(null, fd);
      setSearchAttempted(true);
      if (result.success) {
        setCustomers(result.data);
      } else {
        toast.error(result.error ?? 'Customer search failed.');
      }
    });
  };

  const handleSelectCustomer = (customer: CustomerPickerItem) => {
    setResolvedCustomer({ id: customer.id, displayName: customer.displayName });
    setSelectedPropertyId('');
    setProperties([]);
    loadPropertiesFor(customer.id);
  };

  // ---- Manual mode: create the customer (+ its property) inline ----

  async function createCustomerAndProperty(formData: FormData) {
    const customerResult = await createCustomerAction(null, formData);
    if (!customerResult.success) {
      const message = customerResult.error ?? 'Could not create the customer.';
      setManualError(message);
      toast.error(message);
      return;
    }

    const propertyFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      propertyFormData.append(key, value);
    }
    propertyFormData.set('customerId', customerResult.data.id);

    const propertyResult = await createPropertyForCustomerAction(null, propertyFormData);
    if (!propertyResult.success) {
      const message = `Customer created, but the property could not be added: ${propertyResult.error ?? 'unknown error'}.`;
      setManualError(message);
      toast.error(message);
      return;
    }

    setResolvedCustomer({ id: customerResult.data.id, displayName: computeDisplayName(formData) });
    setSelectedPropertyId(propertyResult.data.id);
    toast.success('Customer and property created.');
  }

  function handleManualContinue() {
    if (!manualContainerRef.current) return;
    setManualError(null);
    const formData = formDataFromContainer(manualContainerRef.current);
    const email = String(formData.get('email') ?? '').trim();

    if (email) {
      startResolveManual(async () => {
        const result = await checkCustomerEmailAction(email);
        if (result.success && result.data) {
          setManualDuplicateMatch(result.data);
          setManualPendingFormData(formData);
          return;
        }
        await createCustomerAndProperty(formData);
      });
      return;
    }

    startResolveManual(async () => {
      await createCustomerAndProperty(formData);
    });
  }

  function handleUseExistingFromDuplicate() {
    const match = manualDuplicateMatch;
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    if (!match) return;
    setResolvedCustomer({ id: match.id, displayName: match.displayName });
    setSelectedPropertyId('');
    setProperties([]);
    loadPropertiesFor(match.id);
  }

  function handleCreateAnywayFromDuplicate() {
    const formData = manualPendingFormData;
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
    if (!formData) return;
    startResolveManual(async () => {
      await createCustomerAndProperty(formData);
    });
  }

  function cancelDuplicateMatch() {
    setManualDuplicateMatch(null);
    setManualPendingFormData(null);
  }

  // ---- Add a property inline for an already-resolved (existing) customer ----

  function handleAddProperty() {
    setAddPropertyError(null);
    if (!resolvedCustomer || !addPropertyContainerRef.current) return;
    const formData = formDataFromContainer(addPropertyContainerRef.current);
    formData.set('customerId', resolvedCustomer.id);

    startAddProperty(async () => {
      const result = await createPropertyForCustomerAction(null, formData);
      if (result.success) {
        toast.success('Property added.');
        setIsAddingProperty(false);
        setSelectedPropertyId(result.data.id);
        loadPropertiesFor(resolvedCustomer.id);
      } else {
        const message = result.error ?? 'Could not add the property. Please try again.';
        setAddPropertyError(message);
        toast.error(message);
      }
    });
  }

  function cancelAddProperty() {
    setIsAddingProperty(false);
    setAddPropertyError(null);
  }

  return {
    customerMode,
    setCustomerMode,
    resolvedCustomer,
    resetCustomer,
    isSearching,
    query,
    setQuery,
    customers,
    searchAttempted,
    handleSearch,
    handleSelectCustomer,
    manualContainerRef,
    isResolvingManual,
    manualDuplicateMatch,
    manualError,
    handleManualContinue,
    handleUseExistingFromDuplicate,
    handleCreateAnywayFromDuplicate,
    cancelDuplicateMatch,
    properties,
    selectedPropertyId,
    setSelectedPropertyId,
    isLoadingProps,
    isAddingProperty,
    setIsAddingProperty,
    addPropertyContainerRef,
    isAddingPropertySubmit,
    addPropertyError,
    handleAddProperty,
    cancelAddProperty,
  };
}

export type CustomerPropertyResolver = ReturnType<typeof useCustomerPropertyResolver>;
