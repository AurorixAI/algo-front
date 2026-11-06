import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type EmptyStateVariant = "card" | "inline" | "filtered";

/**
 * «Why it is empty and what to do» - never «Нет данных».  A short friendly phrase (the title), at most two lines of a hint, one action (usually a `Button secondary`), a simple icon in a soft circle (optional).
 * `card`: instead of a list or a table (dashed frame); `inline`: inside a card; `filtered`: nothing matches the filters («Сбросить фильтры» is the action).  Loading is not an empty state: use Skeleton.
 */
export function EmptyState({ icon: Icon, title, hint, action, variant = "card", testId, className = "" }: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  testId?: string;
  className?: string;
}) {
  const frame = variant === "card" ? "rounded-card border border-dashed border-slate-200 bg-white px-4 py-10" : "px-4 py-8";
  return (
    <div data-testid={testId} data-variant={variant} className={`flex flex-col items-center gap-1 text-center ${frame}${className ? ` ${className}` : ""}`}>
      {Icon && (
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-5 text-slate-600">{hint}</p>}
      {action && <div className="mt-3 flex flex-col max-sm:w-full">{action}</div>}
    </div>
  );
}
