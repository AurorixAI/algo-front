"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Repeat2 } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import {
  ASSIGNED_TITLE,
  MY_REQUESTS_TITLE,
  NEW_REQUEST_LINK,
  STATUS_TONE_CLASS,
  WITHDRAW_ACTION,
  alreadyDecided,
  assignedLine,
  itemLessonLine,
  recentRequests,
  substitutionErrorText,
  teacherStatusLine,
} from "@/lib/substitutions";
import type { MineOut } from "@/lib/substitution-types";

/**
 * T2 (LOGIC-B2): on the teacher's dashboard - «Запросы на замену» (waiting ones with «Отозвать», the decided ones of the last 14 days
 * with the result) and «Вам назначена замена» (the lessons he takes over; the reason of the other teacher is never shown).
 * Shown only when there is something to show; «Новый запрос» opens the request for lessons of his choice.
 */
export function TeacherRequestsBlock({
  refreshKey,
  onNewRequest,
  onChanged,
}: {
  /** Bumped by the page whenever it reloads its own data. */
  refreshKey: number;
  onNewRequest: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<MineOut | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  const load = useCallback(async () => {
    const mine = ++token.current;
    try {
      const out = await substitutionsApi.mine("all");
      if (mine === token.current) setData(out);
    } catch {
      // a quiet block: the dashboard has its own error banner; the last read stays
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const withdraw = async (requestId: string) => {
    if (busyId) return;
    setBusyId(requestId);
    setError(null);
    try {
      await substitutionsApi.withdraw(requestId);
      await load();
      onChanged?.();
    } catch (failure) {
      const decided = alreadyDecided(failure);
      setError(decided ? decided.message : substitutionErrorText(failure));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const items = data ? recentRequests(data.items ?? [], Date.now()) : [];
  const assigned = data?.assignedToMe ?? [];
  if (items.length === 0 && assigned.length === 0) return null;

  return (
    <section aria-label={MY_REQUESTS_TITLE} className="grid gap-5 lg:grid-cols-2">
      {items.length > 0 && (
        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-xs sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Repeat2 className="h-5 w-5 text-amber-600" />
              {MY_REQUESTS_TITLE}
            </h2>
            <button type="button" onClick={onNewRequest} className="text-xs font-bold text-primary-600 hover:text-primary-700">{NEW_REQUEST_LINK}</button>
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const status = teacherStatusLine(item);
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 text-sm font-medium text-slate-800">{itemLessonLine(item)}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`max-w-full break-words rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE_CLASS[status.tone]}`}>{status.text}</span>
                    {item.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => void withdraw(item.id)}
                        disabled={busyId !== null}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {busyId === item.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Отозвать
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {error && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{error}</p>}
        </div>
      )}
      {assigned.length > 0 && (
        <div className="rounded-3xl border border-violet-100 bg-violet-50/50 p-5 shadow-xs sm:p-6">
          <h2 className="mb-3 text-base font-bold text-violet-950">{ASSIGNED_TITLE}</h2>
          <ul className="space-y-2">
            {assigned.map((entry) => (
              <li key={`${entry.groupId}-${entry.lessonDate}-${entry.lessonId}`} className="text-sm font-medium text-violet-950">{assignedLine(entry)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
