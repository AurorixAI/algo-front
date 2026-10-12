"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataLoadErrorProps {
  title?: string;
  message?: string | null;
  /** Omit for a failure that repeating the request cannot fix (e.g. HTTP 403): no retry button. */
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * A single, explicit state for an unavailable authoritative data source.
 * It intentionally never presents a failed request as an empty collection.
 */
export function DataLoadError({
  title = "Не удалось загрузить данные",
  message = "Проверьте соединение с интернетом и повторите попытку.",
  onRetry,
  isRetrying = false,
  compact = false,
  className,
}: DataLoadErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-rose-200 bg-rose-50 text-rose-900",
        compact ? "flex items-start gap-3 px-4 py-3" : "p-6 text-center",
        className,
      )}
    >
      <AlertCircle className={cn("shrink-0 text-rose-600", compact ? "mt-0.5 h-5 w-5" : "mx-auto mb-3 h-7 w-7")} />
      <div className={cn(compact ? "min-w-0 flex-1" : "") }>
        <p className="font-semibold">{title}</p>
        {message && <p className="mt-1 text-sm leading-5 text-rose-700">{message}</p>}
        {onRetry && <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-200 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60",
            compact ? "mt-3" : "mt-4",
          )}
        >
          <RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />
          {isRetrying ? "Обновляем…" : "Повторить"}
        </button>}
      </div>
    </div>
  );
}

export function getDataLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Проверьте соединение с интернетом и повторите попытку.";
}
