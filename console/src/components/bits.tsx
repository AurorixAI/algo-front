"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { DataLoadError } from "@/components/ui/data-load-error";
import { cn } from "@/lib/utils";
import type { Tone } from "../lib/labels";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Pill({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A white panel with a hairline border: the console's replacement for the cabinets' glass cards (stricter, denser). */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</h3>
      {aside}
    </div>
  );
}

/** Label / value rows of a card. */
export function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-slate-500">{row.label}</dt>
          <dd className="min-w-0 break-words text-slate-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled block of label / text rows; nothing at all (no empty title) when no row is filled. */
export function DetailSection({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Facts rows={rows.map((row) => ({ label: row.label, value: <span className="whitespace-pre-wrap">{row.value}</span> }))} />
    </section>
  );
}

export function EmptyState({ title, text, icon, action }: { title: string; text?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" data-testid="empty-state">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon ?? <Inbox className="h-5 w-5" aria-hidden />}</div>
      <p className="mt-3 font-medium text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A failed load. Says so calmly and offers a retry; it never looks like an empty list. */
export function LoadFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="p-4" data-testid="load-failure">
      <DataLoadError message={message} onRetry={onRetry} />
    </div>
  );
}

/** Banner for a result of an action (a link was sent, limits saved with a warning). */
export function Notice({ tone = "blue", children }: { tone?: "blue" | "amber" | "red" | "green"; children: ReactNode }) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", styles[tone])}>
      {children}
    </div>
  );
}
