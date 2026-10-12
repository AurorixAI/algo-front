"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary of the report route segment (admin and teacher): a render error
 * in the report (for example an unexpected report_json shape) shows this card
 * with a retry instead of a white screen. The layout / sidebar stay in place.
 */
export default function ReportSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const listHref = pathname?.startsWith("/teacher") ? "/teacher/groups" : "/admin/diagnostics";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      data-testid="diagnostic-report-crash"
      className="max-w-xl mx-auto mt-16 bg-white rounded-2xl border border-rose-100 p-6 sm:p-8 text-center shadow-sm"
    >
      <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
      <h1 className="text-lg font-bold text-slate-900">Не удалось показать отчёт</h1>
      <p className="text-sm text-slate-500 mt-2">
        При отображении отчёта произошла ошибка. Повторите попытку; если ошибка повторяется, обратитесь к администратору.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
        >
          Повторить
        </button>
        <Link
          href={listHref}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
        >
          Назад к списку
        </Link>
      </div>
    </div>
  );
}
