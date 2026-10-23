"use client";

import { Select } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, UserMinus } from "lucide-react";
import { substitutionsApi } from "@/lib/api";
import { addIsoDays } from "@/lib/business-time";
import { Modal } from "@/components/ui/modal";
import {
  COMMENT_MAX,
  COMMENT_REQUIRED_TEXT,
  MY_LESSON_BLOCK_TEXT,
  REASON_OPTIONS,
  REQUEST_DIALOG_TITLE,
  REQUEST_EXPLAIN,
  SUGGEST_HINT,
  buildCreate,
  commentError,
  lessonKeyOfRef,
  lessonLine,
  myLessonLabel,
  rangeError,
  sendLabel,
  substitutionErrorText,
} from "@/lib/substitutions";
import type { CreateSubstitutionOut, MyLesson, SubstitutionReasonCode } from "@/lib/substitution-types";

/** The lesson the dialog was opened on; `null` = «Новый запрос»: the teacher picks the lessons himself. */
export interface RequestLesson {
  groupId: string;
  groupName: string;
  lessonId: string;
  /** YYYY-MM-DD */
  lessonDate: string;
  startTime: string;
  endTime: string;
}

export interface Colleague {
  id: string;
  name: string;
}

const FIELD_CLASS =
  "w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";
const DATE_CLASS =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/10";

/**
 * T1 (LOGIC-B2): «Не смогу провести урок».  The teacher says why (Болезнь / Личное / Другое + a comment), may add other lessons of his
 * (a range of dates with check boxes) and may name a colleague.  The administrator decides; nothing changes until then.
 * Opened from the lesson panel (the lesson is known) or from «Новый запрос» on the dashboard (the lessons are picked).
 */
export function RequestDialog({
  open,
  lesson,
  today,
  viewerId,
  aboveLessonPanel = false,
  onClose,
  onSent,
}: {
  open: boolean;
  lesson: RequestLesson | null;
  today: string;
  viewerId?: string | null;
  aboveLessonPanel?: boolean;
  onClose: () => void;
  onSent: (out: CreateSubstitutionOut) => void;
}) {
  const [reasonCode, setReasonCode] = useState<SubstitutionReasonCode>("sick");
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [suggestedId, setSuggestedId] = useState("");
  const [colleagues, setColleagues] = useState<Colleague[] | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addIsoDays(today, 13));
  const [others, setOthers] = useState<MyLesson[] | null>(null);
  const [othersLoading, setOthersLoading] = useState(false);
  const [othersError, setOthersError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rangeToken = useRef(0);

  const primaryKey = lesson ? lessonKeyOfRef(lesson) : null;

  const loadOthers = useCallback(async (dateFrom: string, dateTo: string) => {
    const problem = rangeError(dateFrom, dateTo);
    if (problem) { setOthersError(problem); return; }
    const token = ++rangeToken.current;
    setOthersLoading(true);
    setOthersError(null);
    try {
      const out = await substitutionsApi.myLessons(dateFrom, dateTo);
      if (token !== rangeToken.current) return;
      setOthers(out.lessons ?? []);
    } catch (failure) {
      if (token !== rangeToken.current) return;
      setOthers(null);
      setOthersError(substitutionErrorText(failure, "Не удалось загрузить уроки. Повторите попытку."));
    } finally {
      if (token === rangeToken.current) setOthersLoading(false);
    }
  }, []);

  // A fresh dialog: reasons, comment and picks start empty; «Новый запрос» opens with the list already read.
  useEffect(() => {
    if (!open) { rangeToken.current += 1; return; }
    setReasonCode("sick");
    setComment("");
    setTouched(false);
    setSuggestedId("");
    setBusy(false);
    setError(null);
    setOthers(null);
    setOthersError(null);
    setPicked(new Set());
    setFrom(today);
    setTo(addIsoDays(today, 13));
    const pickMode = primaryKey === null;
    setRangeOpen(pickMode);
    if (pickMode) void loadOthers(today, addIsoDays(today, 13));
    // keyed by the lesson's identity, not by the object: the parent builds a new one on every render and a half-typed form must survive that
  }, [open, primaryKey, today, loadOthers]);

  // The colleagues a teacher may name: `GET /org/substitutions/colleagues` (a teacher may read it; no e-mail, no phone).  When it
  // fails the choice is simply not offered and the request goes without a suggestion.
  useEffect(() => {
    if (!open || colleagues !== null) return;
    let cancelled = false;
    substitutionsApi.colleagues()
      .then((rows) => {
        if (cancelled) return;
        setColleagues((Array.isArray(rows) ? rows : [])
          .filter((member) => member.id !== viewerId)
          .map((member) => ({ id: String(member.id), name: member.name || "Сотрудник" }))
          .sort((a, b) => a.name.localeCompare(b.name, "ru")));
      })
      .catch(() => { if (!cancelled) setColleagues([]); });
    return () => { cancelled = true; };
  }, [open, colleagues, viewerId]);

  const visibleOthers = useMemo(
    () => (others ?? []).filter((entry) => lessonKeyOfRef(entry) !== primaryKey),
    [others, primaryKey],
  );

  const chosenOthers = visibleOthers.filter((entry) => entry.canRequest && picked.has(lessonKeyOfRef(entry)));
  const total = (lesson ? 1 : 0) + chosenOthers.length;
  const problem = commentError(reasonCode, comment);
  const canSend = total > 0 && !busy;

  const send = async () => {
    if (busy) return;
    setTouched(true);
    if (total === 0) { setError("Выберите хотя бы один урок"); return; }
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      const refs = [
        ...(lesson ? [{ groupId: lesson.groupId, lessonId: lesson.lessonId, lessonDate: lesson.lessonDate }] : []),
        ...chosenOthers.map(({ groupId, lessonId, lessonDate }) => ({ groupId, lessonId, lessonDate })),
      ];
      const out = await substitutionsApi.create(buildCreate({ lessons: refs, reasonCode, comment, suggestedTeacherId: suggestedId || null }));
      onSent(out);
    } catch (failure) {
      setError(substitutionErrorText(failure, "Не удалось отправить запрос. Повторите попытку."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open
      title={REQUEST_DIALOG_TITLE}
      description={lesson ? lessonLine(lesson.groupName, lesson.lessonDate, lesson.startTime, lesson.endTime) : "Выберите уроки, которые не сможете провести"}
      icon={<UserMinus className="h-5 w-5" />}
      onClose={onClose}
      busy={busy}
      aboveLessonPanel={aboveLessonPanel}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Отмена</button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {sendLabel(Math.max(total, 1))}
          </button>
        </>
      }
    >
      <RequestBody
        reasonCode={reasonCode}
        comment={comment}
        commentProblem={touched ? problem : null}
        colleagues={colleagues}
        suggestedId={suggestedId}
        rangeOpen={rangeOpen}
        from={from}
        to={to}
        others={others === null ? null : visibleOthers}
        othersLoading={othersLoading}
        othersError={othersError}
        picked={picked}
        pickedCount={chosenOthers.length}
        busy={busy}
        error={error}
        onReason={(code) => { setReasonCode(code); setError(null); }}
        onComment={(value) => { setComment(value); setError(null); }}
        onSuggested={setSuggestedId}
        onToggleRange={() => {
          const next = !rangeOpen;
          setRangeOpen(next);
          if (next && others === null && !othersLoading) void loadOthers(from, to);
        }}
        onFrom={setFrom}
        onTo={setTo}
        onShow={() => void loadOthers(from, to)}
        onPick={(key, on) => setPicked((previous) => {
          const next = new Set(previous);
          if (on) next.add(key); else next.delete(key);
          return next;
        })}
      />
    </Modal>
  );
}

/** The inside of the dialog (T1): the reason, the comment, «Другие мои уроки», the colleague. */
export function RequestBody({
  reasonCode, comment, commentProblem, colleagues, suggestedId, rangeOpen, from, to, others, othersLoading, othersError,
  picked, pickedCount, busy, error, onReason, onComment, onSuggested, onToggleRange, onFrom, onTo, onShow, onPick,
}: {
  reasonCode: SubstitutionReasonCode;
  comment: string;
  commentProblem: string | null;
  colleagues: Colleague[] | null;
  suggestedId: string;
  rangeOpen: boolean;
  from: string;
  to: string;
  others: MyLesson[] | null;
  othersLoading: boolean;
  othersError: string | null;
  picked: ReadonlySet<string>;
  pickedCount: number;
  busy: boolean;
  error: string | null;
  onReason: (code: SubstitutionReasonCode) => void;
  onComment: (value: string) => void;
  onSuggested: (id: string) => void;
  onToggleRange: () => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onShow: () => void;
  onPick: (key: string, on: boolean) => void;
}) {
  return (
    <div className="space-y-5 pb-1">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold text-slate-500">Причина</legend>
        <div role="radiogroup" aria-label="Причина" className="grid grid-cols-3 gap-2">
          {REASON_OPTIONS.map((option) => {
            const checked = reasonCode === option.code;
            return (
              <label
                key={option.code}
                className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-primary-500/30 ${
                  checked ? "border-primary-500 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input type="radio" name="substitution-reason" value={option.code} checked={checked} disabled={busy} onChange={() => onReason(option.code)} className="sr-only" />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="substitution-comment" className="mb-1.5 block text-[13px] font-semibold text-slate-500">
          {reasonCode === "other" ? "Комментарий (обязательно)" : "Комментарий"}
        </label>
        <textarea
          id="substitution-comment"
          value={comment}
          rows={2}
          maxLength={COMMENT_MAX}
          disabled={busy}
          onChange={(event) => onComment(event.target.value)}
          placeholder="Например: больничный до 30.10"
          aria-invalid={Boolean(commentProblem)}
          className={FIELD_CLASS}
        />
        {commentProblem && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">{commentProblem === COMMENT_REQUIRED_TEXT ? COMMENT_REQUIRED_TEXT : commentProblem}</p>}
      </div>

      <div className="rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={onToggleRange}
          aria-expanded={rangeOpen}
          aria-controls="substitution-range"
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <span>Другие мои уроки{pickedCount > 0 ? ` · выбрано ${pickedCount}` : ""}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${rangeOpen ? "rotate-180" : ""}`} />
        </button>
        {rangeOpen && (
          <div id="substitution-range" className="space-y-3 border-t border-slate-100 px-3.5 py-3">
            <div className="grid grid-cols-[1fr_1fr] items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs font-semibold text-slate-500">С
                <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} className={`${DATE_CLASS} mt-1`} />
              </label>
              <label className="text-xs font-semibold text-slate-500">По
                <input type="date" value={to} onChange={(event) => onTo(event.target.value)} className={`${DATE_CLASS} mt-1`} />
              </label>
              <button type="button" onClick={onShow} disabled={othersLoading} className="col-span-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:col-span-1">
                Показать уроки
              </button>
            </div>
            {othersError && <p role="alert" className="text-xs font-medium text-rose-700">{othersError}</p>}
            {othersLoading && (
              <p role="status" className="flex items-center gap-2 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</p>
            )}
            {!othersLoading && others && (
              others.length === 0 ? (
                <p className="py-1 text-sm text-slate-500">В этот период у вас нет уроков.</p>
              ) : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                  {others.map((entry) => {
                    const key = lessonKeyOfRef(entry);
                    const blocked = !entry.canRequest;
                    const why = entry.blockReason ? MY_LESSON_BLOCK_TEXT[entry.blockReason] : null;
                    return (
                      <li key={key}>
                        <label className={`flex items-start gap-3 px-3 py-2.5 text-sm ${blocked ? "cursor-not-allowed bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-slate-50"}`}>
                          <input
                            type="checkbox"
                            checked={!blocked && picked.has(key)}
                            disabled={blocked || busy}
                            onChange={(event) => onPick(key, event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="min-w-0">
                            <span className={`block ${blocked ? "" : "font-medium text-slate-800"}`}>{myLessonLabel(entry)}</span>
                            {blocked && why && <span className="block text-xs">{why}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        )}
      </div>

      {colleagues !== null && colleagues.length > 0 && (
        <div>
          <label htmlFor="substitution-suggested" className="mb-1.5 block text-[13px] font-semibold text-slate-500">Предложить коллегу (необязательно)</label>
          <Select
            id="substitution-suggested"
            value={suggestedId}
            disabled={busy}
            onChange={(event) => onSuggested(event.target.value)}
            options={[{ value: "", label: "Не выбирать" }, ...colleagues.map((colleague) => ({ value: colleague.id, label: colleague.name }))]}
            buttonClassName="py-2.5"
          />
          <p className="mt-1.5 text-xs text-slate-500">{SUGGEST_HINT}</p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">{REQUEST_EXPLAIN}</p>
      {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
    </div>
  );
}
