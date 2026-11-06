"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

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
  // inside a screen the failure is the one Notice of the product; only the full-page state keeps its own card
  if (compact) {
    return (
      <Notice
        variant="error"
        title={title}
        className={className}
        action={onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry} disabled={isRetrying} icon={<RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />} className="border-danger-200 text-danger-700 hover:bg-danger-50">
            {isRetrying ? "Обновляем…" : "Повторить"}
          </Button>
        ) : undefined}
      >
        {message}
      </Notice>
    );
  }
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
        {onRetry && <Button
          type="button"
          variant="secondary"
          onClick={onRetry}
          disabled={isRetrying}
          icon={<RefreshCw className={cn("h-4 w-4", isRetrying && "animate-spin")} />}
          className={cn("border-danger-200 text-danger-700 hover:bg-danger-50", compact ? "mt-3" : "mt-4")}
        >
          {isRetrying ? "Обновляем…" : "Повторить"}
        </Button>}
      </div>
    </div>
  );
}

export function getDataLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Проверьте соединение с интернетом и повторите попытку.";
}
