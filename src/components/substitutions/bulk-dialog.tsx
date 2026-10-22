"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Repeat2 } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { SubstituteForm } from "@/components/substitutions/decision-dialog";
import {
  CANCEL_CONSEQUENCES,
  CANCEL_REASON_LABEL,
  REJECT_REASON_LABEL,
  buildBulk,
  decisionReasonError,
  startsAtMsOf,
  substitutionErrorText,
} from "@/lib/substitutions";
import type { CandidatesOut, DecideBulkOut, SubstitutionItem } from "@/lib/substitution-types";

export type BulkKind = "substitute" | "cancel" | "reject";

const FIELD_CLASS =
  "w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";

const TITLE: Record<BulkKind, string> = {
  substitute: "Назначить замену",
  cancel: "Отменить уроки",
  reject: "Отклонить запросы",
};

const SUBMIT: Record<BulkKind, string> = {
  substitute: "Назначить замену",
  cancel: "Отменить уроки",
  reject: "Отклонить запросы",
};

/**
 * M2: the bulk panel «Выбрано: n» → one decision for several requests (up to 50): the same substitute, or the same reason for a cancellation /
 * a refusal.  «Перенести» is not offered (it needs a time of its own).  Each request is decided on its own; the answer lists the ones that
 * could not be (a busy substitute, somebody decided first), and the page shows them.
 */
export function BulkDialog({
  kind,
  items,
  role,
  onClose,
  onDone,
}: {
  kind: BulkKind | null;
  items: SubstitutionItem[];
  role: "owner" | "admin";
  onClose: () => void;
  onDone: (out: DecideBulkOut) => void;
}) {
  const [candidates, setCandidates] = useState<CandidatesOut | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(0);

  // the nearest lesson of the selection stands for the candidates (the server checks every lesson on its own)
  const first = items.slice().sort((a, b) => (startsAtMsOf(a) ?? 0) - (startsAtMsOf(b) ?? 0))[0] ?? null;
  const firstId = first?.id ?? null;

  const loadCandidates = useCallback(async () => {
    if (!firstId) return;
    const mine = ++token.current;
    setCandidatesError(null);
    try {
      const out = await substitutionsApi.candidates(firstId);
      if (mine !== token.current) return;
      setCandidates(out);
    } catch (failure) {
      if (mine !== token.current) return;
      setCandidates(null);
      setCandidatesError(substitutionErrorText(failure, "Не удалось загрузить преподавателей. Повторите попытку."));
    }
  }, [firstId]);

  useEffect(() => {
    setPick(null); setNote(""); setReason(""); setTouched(false); setBusy(false); setError(null); setCandidates(null);
    if (kind === "substitute") void loadCandidates();
    else token.current += 1;
  }, [kind, loadCandidates]);

  if (!kind) return null;

  const problem = kind === "substitute" ? (pick ? null : "Выберите преподавателя") : decisionReasonError(kind === "cancel" ? "cancel" : "reject", reason);

  const submit = async () => {
    if (busy) return;
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const out = await substitutionsApi.decideBulk(buildBulk(items.map((item) => item.id), kind, { teacherId: pick, reason, note }));
      onDone(out);
    } catch (failure) {
      setError(substitutionErrorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`${TITLE[kind]} (${items.length})`}
      icon={<Repeat2 className="h-5 w-5" />}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (touched && Boolean(problem))}
            className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${kind === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-600 hover:bg-primary-700"}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {SUBMIT[kind]}
          </button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        {kind === "substitute" && (
          <>
            <SubstituteForm
              candidates={candidates}
              candidatesError={candidatesError}
              requesterId={first?.teacher.id ?? ""}
              pick={pick}
              note={note}
              role={role}
              busy={busy}
              onPick={(id) => { setPick(id); setError(null); }}
              onNote={setNote}
              onRetry={() => void loadCandidates()}
            />
            {items.length > 1 && <p className="text-xs text-slate-500">Занятость проверяется для каждого урока отдельно: если преподаватель занят, этот урок останется в списке.</p>}
          </>
        )}
        {kind !== "substitute" && (
          <>
            <div>
              <label htmlFor="substitution-bulk-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">{kind === "cancel" ? CANCEL_REASON_LABEL : REJECT_REASON_LABEL}</label>
              <textarea id="substitution-bulk-reason" value={reason} rows={2} maxLength={kind === "cancel" ? 500 : 300} disabled={busy} onChange={(event) => { setReason(event.target.value); setError(null); }} className={FIELD_CLASS} />
            </div>
            {kind === "cancel" && <p className="text-xs leading-relaxed text-slate-600">{CANCEL_CONSEQUENCES}</p>}
          </>
        )}
        {touched && problem && <p role="alert" className="text-xs font-medium text-rose-600">{problem}</p>}
        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
