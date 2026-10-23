"use client";

import { Select } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarClock, Ban, Loader2, Repeat2, UserRoundCheck, XCircle } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import { Modal } from "@/components/ui/modal";
import { opsErrorCode } from "@/lib/ops-errors";
import {
  CANCEL_CONSEQUENCES,
  CANCEL_REASON_LABEL,
  LATE_BANNER_TEXT,
  MOVE_REASON_LABEL,
  NO_FREE_TEACHERS_TEXT,
  RATE_MISSING_TEXT,
  REJECT_REASON_LABEL,
  SUBSTITUTE_NOTE_HINT,
  SUGGESTED_CHIP,
  URGENT_LABEL,
  alreadyDecided,
  availableDecisions,
  buildDecide,
  candidateBusyLine,
  canPickCandidate,
  decisionCardTitle,
  decisionHeader,
  decisionReasonError,
  decisionResultText,
  examDraftCancelText,
  examDraftText,
  examRunningText,
  isLateRequest,
  itemLessonLine,
  moveCheckLines,
  moveCheckParams,
  moveExplain,
  moveFormError,
  needsFreshCandidates,
  noFreeCandidates,
  orderedCandidates,
  reasonLabelOf,
  rejectConsequence,
  roleChip,
  startedLabel,
  substitutionErrorText,
  suggestedLine,
  type MoveForm,
} from "@/lib/substitutions";
import type {
  CandidatesOut,
  DecideOut,
  ExamBinding,
  MoveCheckOut,
  SubstitutionDecisionKind,
  SubstitutionItem,
} from "@/lib/substitution-types";
import { DateInput } from "@/components/ui/date-input";

const FIELD_CLASS =
  "w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";
const INPUT_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";

const CARD_ICON: Record<SubstitutionDecisionKind, typeof Repeat2> = {
  substitute: UserRoundCheck,
  reschedule: CalendarClock,
  cancel: Ban,
  reject: XCircle,
};

const CARD_HINT: Record<SubstitutionDecisionKind, string> = {
  substitute: "Другой преподаватель проведёт урок",
  reschedule: "Новая дата и время",
  cancel: "Урока не будет",
  reject: "Урок остаётся за преподавателем",
};

/** The first fortnight of the move form: the lesson's own time, from tomorrow on a new day. */
export function initialMoveForm(item: SubstitutionItem, today: string): MoveForm {
  const date = item.lesson.date >= today ? item.lesson.date : today;
  return {
    newDate: date,
    startTime: item.lesson.startTime,
    endTime: item.lesson.endTime,
    room: "",
    format: item.lesson.format === "online" ? "online" : "offline",
    reason: "",
  };
}

/**
 * M3 (LOGIC-B2): the decision about one request.  Four cards - «Назначить замену», «Перенести урок», «Отменить урок», «Отклонить запрос» -
 * each opens its own form under the head of the request (who, which lesson, why, what the teacher suggested).  The server decides once:
 * if another administrator got there first the dialog shows what happened (409) and only «Закрыть» is left.
 */
export function DecisionDialog({
  item,
  role,
  onClose,
  onDecided,
  onStale,
}: {
  item: SubstitutionItem | null;
  role: "owner" | "admin";
  onClose: () => void;
  onDecided: (out: DecideOut) => void;
  /** The request was decided by somebody else: the list takes the fresh item. */
  onStale: (fresh: SubstitutionItem) => void;
}) {
  if (!item) return null;
  return <DecisionDialogInner key={item.id} item={item} role={role} onClose={onClose} onDecided={onDecided} onStale={onStale} />;
}

function DecisionDialogInner({
  item,
  role,
  onClose,
  onDecided,
  onStale,
}: {
  item: SubstitutionItem;
  role: "owner" | "admin";
  onClose: () => void;
  onDecided: (out: DecideOut) => void;
  onStale: (fresh: SubstitutionItem) => void;
}) {
  const today = formatBusinessDate();
  const late = isLateRequest(item);
  const kinds = availableDecisions(item);
  const [kind, setKind] = useState<SubstitutionDecisionKind>("substitute");
  const [candidates, setCandidates] = useState<CandidatesOut | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [move, setMove] = useState<MoveForm>(() => initialMoveForm(item, today));
  const [check, setCheck] = useState<MoveCheckOut | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [binding, setBinding] = useState<ExamBinding | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Somebody decided first: the item as it is now. */
  const [stale, setStale] = useState<{ item: SubstitutionItem | null; message: string } | null>(null);
  const candidatesToken = useRef(0);
  const checkToken = useRef(0);

  const loadCandidates = useCallback(async () => {
    const token = ++candidatesToken.current;
    setCandidatesError(null);
    try {
      const out = await substitutionsApi.candidates(item.id);
      if (token !== candidatesToken.current) return;
      setCandidates(out);
      // the colleague the teacher suggested is on offer first, when he is free
      setPick((current) => {
        if (current && out.candidates.some((entry) => entry.teacherId === current && canPickCandidate(entry, out.requesterId))) return current;
        const suggested = out.candidates.find((entry) => entry.suggested && canPickCandidate(entry, out.requesterId));
        return suggested?.teacherId ?? null;
      });
    } catch (failure) {
      if (token !== candidatesToken.current) return;
      setCandidates(null);
      setCandidatesError(substitutionErrorText(failure, "Не удалось загрузить преподавателей. Повторите попытку."));
    }
  }, [item.id]);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  // the exam bound to the lesson changes what «Перенести» and «Отменить» mean
  useEffect(() => {
    let cancelled = false;
    substitutionsApi.detail(item.id)
      .then((out) => { if (!cancelled) setBinding(out.examBinding ?? null); })
      .catch(() => { if (!cancelled) setBinding(null); });
    return () => { cancelled = true; };
  }, [item.id]);

  // the live check of the new time (with a pause for typing)
  const params = useMemo(() => moveCheckParams(move), [move]);
  useEffect(() => {
    if (kind !== "reschedule" || !params || move.newDate < today) { setCheck(null); setCheckError(null); setChecking(false); return undefined; }
    const token = ++checkToken.current;
    setChecking(true);
    // the answer of the previous time no longer describes this one
    setCheck(null);
    const timer = window.setTimeout(() => {
      substitutionsApi.moveCheck(item.id, params)
        .then((out) => { if (token === checkToken.current) { setCheck(out); setCheckError(null); } })
        .catch((failure) => { if (token === checkToken.current) { setCheck(null); setCheckError(substitutionErrorText(failure)); } })
        .finally(() => { if (token === checkToken.current) setChecking(false); });
    }, 400);
    return () => { window.clearTimeout(timer); };
  }, [kind, params, move.newDate, today, item.id]);

  const pickedName = candidates?.candidates.find((entry) => entry.teacherId === pick)?.name ?? null;

  const problem = (() => {
    if (kind === "substitute") return pick ? null : "Выберите преподавателя";
    if (kind === "reschedule") return moveFormError(move, item, today);
    return decisionReasonError(kind, reason);
  })();
  const examBlocksCancel = kind === "cancel" && binding?.state === "ok" && binding.canCancel === false;
  const blocked = Boolean(problem) || examBlocksCancel || (kind === "reschedule" && check !== null && !check.ok);

  const submit = async () => {
    if (busy) return;
    setTouched(true);
    if (blocked) return;
    setBusy(true);
    setError(null);
    try {
      const body = buildDecide(kind, { teacherId: pick, note, reason, move });
      const out = await substitutionsApi.decide(item.id, body);
      onDecided(out);
    } catch (failure) {
      const decided = alreadyDecided(failure);
      if (decided) {
        setStale(decided);
        if (decided.item) onStale(decided.item);
      } else {
        setError(substitutionErrorText(failure, undefined, { teacherName: pickedName }));
        if (needsFreshCandidates(failure) || opsErrorCode(failure) === "TEACHER_BUSY") { setPick(null); void loadCandidates(); }
      }
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = kind === "substitute" ? "Назначить замену" : kind === "reschedule" ? "Перенести урок" : kind === "cancel" ? "Отменить урок" : "Отклонить запрос";

  return (
    <Modal
      open
      title={decisionHeader(item)}
      description={itemLessonLine(item)}
      icon={<Repeat2 className="h-5 w-5" />}
      onClose={onClose}
      busy={busy}
      maxWidthClassName="max-w-2xl"
      footer={
        stale ? (
          <button type="button" onClick={onClose} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Закрыть</button>
        ) : (
          <>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || (touched && blocked)}
              className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${kind === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-600 hover:bg-primary-700"}`}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
            </button>
          </>
        )
      }
    >
      {stale ? (
        <StaleBody message={stale.message} item={stale.item ?? item} />
      ) : (
        <DecisionBody
          item={item}
          role={role}
          late={late}
          kinds={kinds}
          kind={kind}
          candidates={candidates}
          candidatesError={candidatesError}
          pick={pick}
          note={note}
          move={move}
          check={check}
          checking={checking}
          checkError={checkError}
          reason={reason}
          binding={binding}
          problem={touched ? problem : null}
          busy={busy}
          error={error}
          onKind={(next) => { setKind(next); setError(null); setTouched(false); }}
          onPick={(id) => { setPick(id); setError(null); }}
          onNote={setNote}
          onMove={(patch) => { setMove((previous) => ({ ...previous, ...patch })); setError(null); }}
          onReason={(value) => { setReason(value); setError(null); }}
          onRetryCandidates={() => void loadCandidates()}
        />
      )}
    </Modal>
  );
}

/** 409 SUBSTITUTION_ALREADY_DECIDED: the sentence and the request as it is now. */
export function StaleBody({ message, item }: { message: string; item: SubstitutionItem }) {
  return (
    <div role="alert" className="space-y-3 pb-1">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
        {message}
      </p>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700">
        {item.status === "pending" ? "Запрос ещё ждёт решения." : decisionResultText(item)}
      </p>
    </div>
  );
}

/** The inside of the dialog: the head of the request, the four cards and the form of the chosen one. */
export function DecisionBody({
  item, role, late, kinds, kind, candidates, candidatesError, pick, note, move, check, checking, checkError, reason, binding,
  problem, busy, error, onKind, onPick, onNote, onMove, onReason, onRetryCandidates,
}: {
  item: SubstitutionItem;
  role: "owner" | "admin";
  late: boolean;
  kinds: SubstitutionDecisionKind[];
  kind: SubstitutionDecisionKind;
  candidates: CandidatesOut | null;
  candidatesError: string | null;
  pick: string | null;
  note: string;
  move: MoveForm;
  check: MoveCheckOut | null;
  checking: boolean;
  checkError: string | null;
  reason: string;
  binding: ExamBinding | null;
  problem: string | null;
  busy: boolean;
  error: string | null;
  onKind: (kind: SubstitutionDecisionKind) => void;
  onPick: (teacherId: string) => void;
  onNote: (value: string) => void;
  onMove: (patch: Partial<MoveForm>) => void;
  onReason: (value: string) => void;
  onRetryCandidates: () => void;
}) {
  const suggested = suggestedLine(item);
  const lines = check ? moveCheckLines(check, item.group.name) : null;
  const examTitle = binding?.state === "ok" ? (binding.title ?? "").trim() : "";
  return (
    <div className="space-y-5 pb-1">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{item.reasonLabel || reasonLabelOf(item.reasonCode)}</span>
          {item.urgent && !late && <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">{URGENT_LABEL}</span>}
          {late && <span className="rounded-md bg-rose-800 px-2 py-0.5 text-xs font-semibold text-white">{startedLabel(item)}</span>}
        </div>
        {item.comment && <p className="mt-2 break-words text-sm text-slate-800">{item.comment}</p>}
        {suggested && <p className="mt-2 text-xs font-medium text-slate-600">{suggested}</p>}
      </div>

      {late && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-amber-900">{LATE_BANNER_TEXT}</p>}

      <div role="radiogroup" aria-label="Решение" className="grid grid-cols-2 gap-2">
        {kinds.map((entry) => {
          const Icon = CARD_ICON[entry];
          const checked = entry === kind;
          return (
            <label
              key={entry}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-primary-500/30 ${
                checked ? (entry === "cancel" ? "border-rose-400 bg-rose-50/60" : "border-primary-500 bg-primary-50/60") : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <input type="radio" name="substitution-decision" value={entry} checked={checked} disabled={busy} onChange={() => onKind(entry)} className="sr-only" />
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? (entry === "cancel" ? "text-rose-600" : "text-primary-600") : "text-slate-400"}`} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug text-slate-900">{decisionCardTitle(entry, late)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{CARD_HINT[entry]}</span>
              </span>
            </label>
          );
        })}
      </div>

      {kind === "substitute" && (
        <SubstituteForm
          candidates={candidates}
          candidatesError={candidatesError}
          requesterId={item.teacher.id}
          pick={pick}
          note={note}
          role={role}
          busy={busy}
          onPick={onPick}
          onNote={onNote}
          onRetry={onRetryCandidates}
        />
      )}

      {kind === "reschedule" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 text-xs font-semibold text-slate-500 sm:col-span-1">Новая дата
              <DateInput value={move.newDate} min={formatBusinessDate()} disabled={busy} onChange={(next) => onMove({ newDate: next })} wrapperClassName="mt-1" className={INPUT_CLASS} />
            </label>
            <label className="text-xs font-semibold text-slate-500">Начало
              <input type="time" value={move.startTime} disabled={busy} onChange={(event) => onMove({ startTime: event.target.value })} className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-slate-500">Окончание
              <input type="time" value={move.endTime} disabled={busy} onChange={(event) => onMove({ endTime: event.target.value })} className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-slate-500">Кабинет (необязательно)
              <input type="text" value={move.room} maxLength={200} disabled={busy} onChange={(event) => onMove({ room: event.target.value })} className={`${INPUT_CLASS} mt-1`} />
            </label>
            <label className="text-xs font-semibold text-slate-500">Формат
              <Select value={move.format} disabled={busy} onChange={(event) => onMove({ format: event.target.value as "offline" | "online" })} options={[{ value: "offline", label: "Офлайн" }, { value: "online", label: "Онлайн" }]} className="mt-1" buttonClassName="py-2 font-normal" />
            </label>
          </div>
          <MoveCheck lines={lines} checking={checking} error={checkError} />
          <div>
            <label htmlFor="substitution-move-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">{MOVE_REASON_LABEL}</label>
            <textarea id="substitution-move-reason" value={move.reason} rows={2} maxLength={500} disabled={busy} onChange={(event) => onMove({ reason: event.target.value })} className={FIELD_CLASS} />
          </div>
          <p className="text-xs leading-relaxed text-slate-500">{moveExplain(candidates?.candidates.find((entry) => entry.isDefaultTeacher)?.name ?? item.teacher.name)}</p>
          {examTitle && <p role="status" className="text-xs font-medium text-amber-800">{examDraftText(examTitle)}</p>}
        </div>
      )}

      {kind === "cancel" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="substitution-cancel-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">{CANCEL_REASON_LABEL}</label>
            <textarea id="substitution-cancel-reason" value={reason} rows={2} maxLength={500} disabled={busy} onChange={(event) => onReason(event.target.value)} className={FIELD_CLASS} />
          </div>
          <p className="text-xs leading-relaxed text-slate-600">{CANCEL_CONSEQUENCES}</p>
          {binding?.state === "ok" && examTitle && (binding.canCancel === false
            ? <p role="alert" className="text-xs font-semibold text-rose-700">{examRunningText(examTitle)}</p>
            : <p role="status" className="text-xs font-medium text-amber-800">{examDraftCancelText(examTitle)}</p>)}
          {binding?.state === "unavailable" && <p role="alert" className="text-xs font-medium text-rose-700">Не удалось проверить экзамены группы. Повторите попытку.</p>}
        </div>
      )}

      {kind === "reject" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="substitution-reject-reason" className="mb-1.5 block text-[13px] font-semibold text-slate-500">{REJECT_REASON_LABEL}</label>
            <textarea id="substitution-reject-reason" value={reason} rows={2} maxLength={300} disabled={busy} onChange={(event) => onReason(event.target.value)} className={FIELD_CLASS} />
          </div>
          <p className="text-xs leading-relaxed text-slate-600">{rejectConsequence(item.teacher.name)}</p>
        </div>
      )}

      {problem && <p role="alert" className="text-xs font-medium text-rose-600">{problem}</p>}
      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}

function MoveCheck({ lines, checking, error }: { lines: ReturnType<typeof moveCheckLines> | null; checking: boolean; error: string | null }) {
  if (error) return <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>;
  if (!lines) return checking ? <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Проверяем время…</p> : null;
  return (
    <div role="status" aria-live="polite" className="space-y-1">
      {lines.lines.map((line) => (
        <p key={line} className={`text-xs font-medium ${lines.ok ? "text-emerald-700" : "text-rose-700"}`}>{line}</p>
      ))}
      {lines.warnings.map((line) => <p key={line} className="text-xs font-medium text-amber-800">{line}</p>)}
    </div>
  );
}

export function SubstituteForm({
  candidates, candidatesError, requesterId, pick, note, role, busy, onPick, onNote, onRetry,
}: {
  candidates: CandidatesOut | null;
  candidatesError: string | null;
  requesterId: string;
  pick: string | null;
  note: string;
  role: "owner" | "admin";
  busy: boolean;
  onPick: (teacherId: string) => void;
  onNote: (value: string) => void;
  onRetry: () => void;
}) {
  if (candidatesError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm font-medium text-rose-700">{candidatesError}</p>
        <button type="button" onClick={onRetry} className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
      </div>
    );
  }
  if (!candidates) {
    return <p role="status" className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем преподавателей…</p>;
  }
  const list = orderedCandidates(candidates.candidates);
  return (
    <div className="space-y-3">
      {list.length === 0 || noFreeCandidates(list, requesterId) ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">{NO_FREE_TEACHERS_TEXT}</p>
      ) : null}
      {list.length > 0 && (
        <ul role="radiogroup" aria-label="Заменяющий" className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {list.map((candidate) => {
            const selectable = canPickCandidate(candidate, requesterId) && !busy;
            const checked = pick === candidate.teacherId;
            const roleText = roleChip(candidate.orgRole);
            return (
              <li key={candidate.teacherId}>
                <label className={`flex items-start gap-3 px-3.5 py-3 text-sm ${selectable ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed bg-slate-50/60"} ${checked ? "bg-primary-50/50" : ""}`}>
                  <input
                    type="radio"
                    name="substitute-teacher"
                    value={candidate.teacherId}
                    checked={checked}
                    disabled={!selectable}
                    onChange={() => onPick(candidate.teacherId)}
                    className="mt-0.5 h-4 w-4 border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`font-medium ${selectable ? "text-slate-900" : "text-slate-400"}`}>{candidate.name}</span>
                      {candidate.suggested && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">{SUGGESTED_CHIP}</span>}
                      {roleText && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{roleText}</span>}
                    </span>
                    {candidate.busy && <span className="mt-0.5 block text-xs font-medium text-amber-700">{candidateBusyLine(candidate.busyWith)}</span>}
                    {role === "owner" && candidate.rateMissing && !candidate.busy && <span className="mt-0.5 block text-xs text-slate-500">{RATE_MISSING_TEXT}</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <label htmlFor="substitution-note" className="mb-1.5 block text-[13px] font-semibold text-slate-500">Комментарий (необязательно)</label>
        <textarea id="substitution-note" value={note} rows={2} maxLength={300} disabled={busy} onChange={(event) => onNote(event.target.value)} className={FIELD_CLASS} />
      </div>
      <p className="text-xs leading-relaxed text-slate-500">{SUBSTITUTE_NOTE_HINT}</p>
    </div>
  );
}

