// Shared form-field wrapper (Forge V1.1 UX modernization, Batch UX-A) —
// standardizes the label/help-text/error pattern already used ad hoc
// across every existing form (new-customer, new-estimate, inspection-form,
// invoice metadata, etc.). Does not replace any existing input component;
// wraps whatever is passed as children (native input, Input primitive,
// textarea, select).
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function FormField({
  id,
  label,
  required,
  helpText,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </Label>
      {children}
      {helpText && !error ? <p className="text-xs text-muted-foreground">{helpText}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
