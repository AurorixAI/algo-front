"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { ExamCancelState } from "@/lib/schedule-card-actions";

/** What the exam bound to a lesson means for the action at hand (a cancellation or a move): the one note of both forms of the lesson sheet. */
export function ExamBindingNote({ state, onRetry }: { state: ExamCancelState; onRetry: () => void }) {
  return (
    <>
    {state.loading && <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Проверяем экзамены группы…</p>}
    {state.message && (
      <div data-testid="exam-binding">
        <p role={state.tone === "error" ? "alert" : "status"} className={`text-xs font-semibold ${state.tone === "error" ? "text-rose-700" : "text-amber-800"}`}>{state.message}</p>
        {state.retry && (
          <button type="button" onClick={onRetry} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3 w-3" />Повторить</button>
        )}
      </div>
    )}
    </>
  );
}
