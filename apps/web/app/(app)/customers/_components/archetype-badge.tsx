import type { CustomerArchetype } from '@premier/shared';

interface ArchetypeBadgeProps {
  archetype: CustomerArchetype | null;
}

interface BadgeConfig {
  label: string;
  classes: string;
}

/**
 * Visual config per archetype. Kept in one place so adjustments are easy.
 * If the DB enum gains a new value, add it here and the type system will
 * complain at every call site until updated.
 */
const ARCHETYPE_CONFIG: Record<CustomerArchetype, BadgeConfig> = {
  residential_one_off: {
    label: 'One-off',
    classes: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  residential_repeat: {
    label: 'Repeat',
    classes: 'bg-green-100 text-green-700 border-green-200',
  },
  landlord_small: {
    label: 'Landlord · small',
    classes: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  landlord_growing: {
    label: 'Landlord · growing',
    classes: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  property_manager: {
    label: 'Property mgr',
    classes: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  commercial: {
    label: 'Commercial',
    classes: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  unknown: {
    label: 'Unknown',
    classes: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

/**
 * Small color-coded label for a customer's archetype. `null` archetype
 * (legacy customers from before migration 0007) renders as Unknown.
 */
export function ArchetypeBadge({ archetype }: ArchetypeBadgeProps) {
  const config = archetype
    ? ARCHETYPE_CONFIG[archetype]
    : ARCHETYPE_CONFIG.unknown;

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
