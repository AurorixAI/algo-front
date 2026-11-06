import type { ReactNode } from "react";
import { AlertTriangle, Info, Lock, XCircle } from "lucide-react";

export type NoticeVariant = "info" | "warning" | "blocked" | "error";

/** One look per meaning (design system, wave 2): info = an explanation (nothing to do), warning = a decision is needed and the action stays possible, blocked = a lock with the way out in `action`, error = a refusal / a failure. */
const LOOK: Record<NoticeVariant, string> = {
  info: "border-info-200 bg-info-50 text-info-900",
  warning: "border-warning-200 bg-warning-50 text-warning-900",
  blocked: "border-warning-200 bg-warning-50 text-warning-900",
  error: "border-danger-200 bg-danger-50 text-danger-700",
};
const ICON = { info: Info, warning: AlertTriangle, blocked: Lock, error: XCircle } as const;
const ICON_TONE: Record<NoticeVariant, string> = { info: "text-info-700", warning: "text-warning-700", blocked: "text-warning-700", error: "text-danger-600" };

/**
 * THE banner of the product: rounded 12, an icon of 16 px, an optional bold title, the text, an optional action (on the right from `sm`, under the text on a phone, full width, >= 40 px).
 * Rules: rights and locks are ONE notice over the list (not one per row); on a screen there is at most one warning; «nothing here» is not a Notice but an EmptyState.  `error` is `role="alert"`.
 */
export function Notice({ variant = "info", title, children, action, testId, className = "", id, compact = false, role }: {
  variant?: NoticeVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** A control (usually a `Button secondary`) that resolves the notice: «Переоткрыть месяц». Required in spirit for `blocked`. */
  action?: ReactNode;
  testId?: string;
  className?: string;
  id?: string;
  /** Inside a dense block: tighter padding. */
  compact?: boolean;
  /** `alert` for what must be announced at once (a refusal), `note` for a standing sign; the default follows the variant. */
  role?: "alert" | "status" | "note";
}) {
  const Icon = ICON[variant];
  return (
    <div
      id={id}
      role={role ?? (variant === "error" ? "alert" : "status")}
      data-testid={testId}
      data-variant={variant}
      className={`flex flex-col gap-2 rounded-control border text-sm sm:flex-row sm:items-start sm:gap-3 ${compact ? "px-3 py-2" : "px-3 py-2.5"} ${LOOK[variant]}${className ? ` ${className}` : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_TONE[variant]}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 leading-5">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 flex-col sm:flex-row [&>*]:max-sm:w-full">{action}</div>}
    </div>
  );
}
