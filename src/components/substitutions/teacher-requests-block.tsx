"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Repeat2 } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import {
  ASSIGNED_TITLE,
  MY_REQUESTS_TITLE,
  NEW_REQUEST_LINK,
  STATUS_TONE_CLASS,
  WITHDRAW_ACTION,
  alreadyDecided,
  assignedAhead,
  assignedLine,
  assignedSingleLine,
  clearedForMeLine,
  itemLessonLine,
  recentRequests,
  substitutionErrorText,
  teacherStatusLine,
} from "@/lib/substitutions";
import type { AssignedToMe, ClearedForMe, MineOut } from "@/lib/substitution-types";
import { businessWallTimeToInstant } from "@/lib/business-time";
import { useNow } from "@/lib/use-now";

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
  const sending = useRef(false);        // a second press in the same tick sees the state of the first one (rule 27)

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
    if (busyId || sending.current) return;
    sending.current = true;
    setBusyId(requestId);
    setError(null);
    try {
      await substitutionsApi.withdraw(requestId);
      await load();
      onChanged?.();
    } catch (failure) {
      const decided = alreadyDecided(failure);
      setError(decided ? decided.message : substitutionErrorText(failure, undefined, { role: "teacher" }));
      await load();
    } finally {
      sending.current = false;
      setBusyId(null);
    }
  };

  const items = data ? recentRequests(data.items ?? [], Date.now()) : [];
  const now = useNow(30_000, true);
  const assigned = assignedAhead(data?.assignedToMe ?? [], now, businessWallTimeToInstant);
  const cleared = data?.clearedForMe ?? [];
  if (items.length === 0 && assigned.length === 0 && cleared.length === 0) return null;

  return (
    <section aria-label={MY_REQUESTS_TITLE} className={`grid gap-5 ${items.length > 0 && assigned.length > 0 ? "lg:grid-cols-2" : ""}`}>
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
      {(assigned.length > 0 || cleared.length > 0) && (
        <div className="space-y-2">
          <AssignedLessons entries={assigned} />
          <ClearedLessons entries={cleared} />
        </div>
      )}
    </section>
  );
}

/** «Вам назначены замены: 2» as ONE compact row that opens the list (a phone keeps its first screen for the requests); one substitution is one row at once (nothing to open). Only a teacher leads lessons, so only his dashboard shows it. */
export function assignedTitle(count: number): string {
  return count === 1 ? ASSIGNED_TITLE : `Вам назначены замены: ${count}`;
}

export function AssignedLessons({ entries }: { entries: AssignedToMe[] }) {
  if (entries.length === 0) return null;
  // one lesson: the row says everything at once, nothing to open
  if (entries.length === 1) {
    return <p data-testid="assigned-lessons" className="rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-sm font-bold text-violet-950 shadow-xs">{assignedSingleLine(entries[0])}</p>;
  }
  return (
    <details data-testid="assigned-lessons" className="group rounded-2xl border border-violet-100 bg-violet-50/50 shadow-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-violet-950 [&::-webkit-details-marker]:hidden">
        <span>{assignedTitle(entries.length)}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-violet-500 transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="space-y-2 border-t border-violet-100 px-4 py-3">
        {entries.map((entry) => (
          <li key={`${entry.groupId}-${entry.lessonDate}-${entry.lessonId}`} className="text-sm font-medium text-violet-950">{assignedLine(entry)}</li>
        ))}
      </ul>
    </details>
  );
}

/** W1 F11 (S22): «Замена снята …» is an EVENT of its own (the substitute lost a lesson), a quiet line - not a part of the card of the lessons he still has. */
export function ClearedLessons({ entries }: { entries: ClearedForMe[] }) {
  if (entries.length === 0) return null;
  return (
    <ul data-testid="cleared-lessons" className="space-y-1 rounded-xl bg-slate-50 px-3.5 py-2.5">
      {entries.map((entry) => (
        <li key={`${entry.groupId}-${entry.lessonDate}-${entry.lessonId}-${entry.clearedAt}`} className="text-xs font-medium text-slate-500">{clearedForMeLine(entry)}</li>
      ))}
    </ul>
  );
}
