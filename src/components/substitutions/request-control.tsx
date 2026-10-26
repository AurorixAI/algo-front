"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Loader2, UserMinus } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import { businessWallTimeToInstant, formatBusinessDate } from "@/lib/business-time";
import { useAuthStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import {
  REQUESTED_LABEL,
  REQUEST_ACTION,
  REQUEST_REJECTED_LABEL,
  WITHDRAW_ACTION,
  alreadyDecided,
  createToast,
  lessonStartMs,
  requestControl,
  substitutionErrorText,
} from "@/lib/substitutions";
import type { CreateSubstitutionOut, SubstitutionRequestMark } from "@/lib/substitution-types";
import { RequestDialog, type RequestLesson } from "@/components/substitutions/request-dialog";

/**
 * T1 on the lesson panel (teacher dashboard, teacher schedule): «Не смогу провести» on his own future lesson; once a request waits,
 * the amber plate «Вы запросили замену» with «Отозвать запрос»; after a refusal, the words «Запрос отклонён».  The panel hands over
 * what its journal read says (`mark`: the request of this lesson, `lessonTeacherId`: who teaches it); the control keeps the answer of its own
 * actions until the panel reads the journal again.
 */
export function RequestControl({
  lesson,
  mark,
  lessonTeacherId,
  lessonStatus,
  onChanged,
}: {
  lesson: RequestLesson;
  mark: SubstitutionRequestMark | null | undefined;
  lessonTeacherId?: string | null;
  lessonStatus: string | null | undefined;
  /** After a request was sent or withdrawn: the panel's page refreshes its own numbers. */
  onChanged?: () => void;
}) {
  const { user } = useAuthStore();
  const role = user?.org_role ?? user?.role ?? null;
  const now = useNow(30_000, true);
  const [local, setLocal] = useState<{ mark: SubstitutionRequestMark | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The answer to the teacher's own action, in the panel itself (a toast would sit under the panel's layer). */
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "warning" } | null>(null);

  // A new journal read (another lesson, a refresh) overrides what this control remembers.
  useEffect(() => { setLocal(null); setError(null); setNotice(null); }, [lesson.groupId, lesson.lessonId, lesson.lessonDate, mark?.id, mark?.status]);

  const effectiveMark = local ? local.mark : mark ?? null;
  const control = requestControl({
    role,
    userId: user?.id,
    lessonTeacherId,
    lessonStatus,
    startsAtMs: lessonStartMs(lesson.lessonDate, lesson.startTime, businessWallTimeToInstant),
    nowMs: now,
    mark: effectiveMark,
  });

  const withdraw = async (requestId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await substitutionsApi.withdraw(requestId);
      setLocal({ mark: null });
      setNotice({ text: "Запрос отозван", tone: "success" });
      onChanged?.();
    } catch (failure) {
      const decided = alreadyDecided(failure);
      if (decided) {
        // somebody decided first: the panel shows what happened
        setLocal({ mark: decided.item ? { id: decided.item.id, status: decided.item.status, reasonCode: decided.item.reasonCode } : null });
        setError(decided.message);
        onChanged?.();
      } else {
        setError(substitutionErrorText(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  const sent = (out: CreateSubstitutionOut) => {
    const toast = createToast(out);
    setNotice({ text: toast.text, tone: toast.type });
    const first = out.created[0] ?? out.alreadyRequested[0];
    if (first) setLocal({ mark: { id: first.id, status: first.status, reasonCode: first.reasonCode } });
    setDialogOpen(false);
    onChanged?.();
  };

  if (control.kind === "none" && !error && !notice) return null;

  return (
    <div className="min-w-0">
      {control.kind === "button" && (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold whitespace-nowrap text-slate-700 shadow-2xs sm:px-3.5 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900"
        >
          <UserMinus className="h-3.5 w-3.5 text-slate-400" />
          {REQUEST_ACTION}
        </button>
      )}
      {control.kind === "pending" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-amber-900">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            {REQUESTED_LABEL}
          </span>
          <button
            type="button"
            onClick={() => void withdraw(control.requestId)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-900 underline-offset-2 hover:bg-amber-100 hover:underline disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {WITHDRAW_ACTION}
          </button>
        </div>
      )}
      {control.kind === "rejected" && (
        <p role="status" className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {REQUEST_REJECTED_LABEL}
        </p>
      )}
      {notice && !error && <p role="status" className={`mt-1.5 text-xs font-medium ${notice.tone === "warning" ? "text-amber-800" : "text-emerald-700"}`}>{notice.text}</p>}
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-700">{error}</p>}

      <RequestDialog
        open={dialogOpen}
        lesson={lesson}
        today={formatBusinessDate()}
        viewerId={user?.id}
        aboveLessonPanel
        onClose={() => setDialogOpen(false)}
        onSent={sent}
      />
    </div>
  );
}
