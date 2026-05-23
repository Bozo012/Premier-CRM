import { cn } from "@/lib/utils";
import type { ListingStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  ListingStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  generating: {
    label: "Generating…",
    className: "bg-amber-100 text-amber-700",
  },
  reviewing: { label: "Review", className: "bg-blue-100 text-blue-700" },
  ready: { label: "Ready", className: "bg-green-100 text-green-700" },
  published_mock: { label: "Published", className: "bg-purple-100 text-purple-700" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
