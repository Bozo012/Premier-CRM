import { cn } from "@/lib/utils";

export function ConfidenceBadge({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  if (score === null) return null;

  const pct = Math.round(score * 100);
  const color =
    pct >= 75
      ? "text-green-700 bg-green-50 border-green-200"
      : pct >= 50
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-red-700 bg-red-50 border-red-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        color,
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          pct >= 75
            ? "bg-green-500"
            : pct >= 50
              ? "bg-amber-500"
              : "bg-red-500"
        )}
      />
      AI {pct}% confident
    </span>
  );
}
