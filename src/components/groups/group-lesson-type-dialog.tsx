"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  checkLessonTypeForm,
  isNoopLessonType,
  LESSON_TYPE_DIALOG_TITLE,
  LESSON_TYPE_FROM_LABEL,
  LESSON_TYPE_IMPACT_TEXT,
  LESSON_TYPE_NO_SHEETS_TEXT,
  lessonTypeDateRange,
  lessonTypeFutureNote,
  lessonTypeHistoryLine,
  lessonTypeKey,
  lessonTypeLine,
  lessonTypeStaleText,
  type GroupLessonTypeChanged,
  type GroupLessonTypes,
  type LessonTypeImpact,
} from "@/lib/group-lesson-type";
import { LESSON_TYPES, type LessonType } from "@/lib/payroll";
import { createRequestSequence } from "@/lib/request-sequence";
import { logicaError } from "@/lib/payments-logica";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PRICE_FIELD, PRICE_LABEL } from "@/components/payments/price-fields";

const IMPACT_DEBOUNCE_MS = 350;

interface GroupLessonTypeDialogProps {
  open: boolean;
  groupId: string;
  groupName: string;
  /** The saved type: the group page updates what it shows. */
  onSaved: (result: GroupLessonTypeChanged) => void;
  onClose: () => void;
}

/**
 * «Тип занятий → Изменить…» (LOGIC-A F14): the current type, the history, a new type «с» a day (today by default, from the
 * start of the last month to today).  Before saving the server is asked (`dry_run`) which saved payroll sheets will say
 * «Есть изменения»; the owner sees the list («октябрь 2026 — Каримова»), an administrator the count.
 */
export function GroupLessonTypeDialog({ open, groupId, groupName, onSaved, onClose }: GroupLessonTypeDialogProps) {
  const today = useMemo(() => formatBusinessDate(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<GroupLessonTypes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lessonType, setLessonType] = useState<LessonType>("group");
  const [validFrom, setValidFrom] = useState("");
  const [impact, setImpact] = useState<{ key: string; data: LessonTypeImpact | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [impactNonce, setImpactNonce] = useState(0);
  const loadSequence = useRef(createRequestSequence());
  const impactSequence = useRef(createRequestSequence());

  // The type and the history are read each time the dialog opens.
  useEffect(() => {
    if (!open) return undefined;
    const token = loadSequence.current.next();
    setState(null);
    setLoadError(null);
    setValidFrom(today);
    setImpact(null);
    setCheckError(null);
    setError(null);
    setSaving(false);
    orgApi.getGroupLessonTypes(groupId)
      .then((result) => {
        if (!loadSequence.current.isCurrent(token)) return;
        setState(result);
        setLessonType(result.current);
      })
      .catch((cause) => {
        if (!loadSequence.current.isCurrent(token)) return;
        setLoadError(cause instanceof Error ? cause.message : "Не удалось загрузить тип занятий");
      });
    return () => { loadSequence.current.next(); };
  }, [open, groupId, today, nonce]);

  const check = useMemo(() => checkLessonTypeForm({ lessonType, validFrom }, today), [lessonType, validFrom, today]);
  const key = lessonTypeKey(check.request);
  const noop = state ? isNoopLessonType(state.history, state.current, check.request) : false;

  // What exactly this type and day would touch.
  useEffect(() => {
    if (!open || !state) return undefined;
    const token = impactSequence.current.next();
    if (!check.request || noop) {
      setChecking(false);
      setCheckError(null);
      return () => { impactSequence.current.next(); };
    }
    const asked = check.request;
    const askedKey = key;
    setChecking(true);
    setCheckError(null);
    const timer = setTimeout(() => {
      orgApi.setGroupLessonType(groupId, asked, { dryRun: true })
        .then((result) => {
          if (!impactSequence.current.isCurrent(token)) return;
          setImpact({ key: askedKey, data: result.impact });
          setChecking(false);
        })
        .catch((cause) => {
          if (!impactSequence.current.isCurrent(token)) return;
          setImpact(null);
          setChecking(false);
          setCheckError(logicaError(cause, "Не удалось проверить последствия").message);
        });
    }, IMPACT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      impactSequence.current.next();
    };
    // `check.request` is a new object on every render; `key` stands for its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupId, key, noop, state, impactNonce]);

  const shown = impact && impact.key === key ? impact : null;
  const ready = Boolean(check.request) && !noop && shown !== null && !checking;
  const stale = shown ? lessonTypeStaleText(shown.data) : null;
  const range = lessonTypeDateRange(today);
  const past = check.request ? lessonTypeFutureNote(check.request.valid_from, today) : null;
  const problem = check.error;

  const save = async () => {
    if (!check.request || !ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await orgApi.setGroupLessonType(groupId, check.request);
      onSaved(result);
      onClose();
    } catch (cause) {
      setError(logicaError(cause, "Не удалось сохранить тип занятий").message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={LESSON_TYPE_DIALOG_TITLE}
      description={groupName}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Отмена
          </button>
          <button
            type="submit"
            form="group-lesson-type-form"
            disabled={!ready || saving}
            title={noop ? "Такой тип с этого дня уже действует" : ready ? undefined : "Кнопка включится, когда будут показаны последствия"}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </>
      )}
    >
      {loadError ? (
        <p role="alert" className="text-sm text-rose-700" data-testid="lesson-type-load-error">
          {loadError}{" "}
          <button type="button" onClick={() => setNonce((value) => value + 1)} className="font-semibold underline">Повторить</button>
        </p>
      ) : !state ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем…</p>
      ) : (
        <form id="group-lesson-type-form" onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3.5 pb-2" noValidate>
          <div>
            <p className="text-sm font-semibold text-slate-900" data-testid="lesson-type-current">{lessonTypeLine(state.current)}</p>
            {state.history.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600" data-testid="lesson-type-history" aria-label="История типа занятий">
                {[...state.history].reverse().map((row) => <li key={`${row.valid_from}-${row.lesson_type}`}>{lessonTypeHistoryLine(row)}</li>)}
              </ul>
            )}
          </div>

          <Select
            label="Новый тип занятий"
            value={lessonType}
            onChange={(event) => { setError(null); setLessonType(event.target.value as LessonType); }}
            options={LESSON_TYPES.map((type) => ({ value: type.key, label: type.label }))}
          />

          <div>
            <label htmlFor="group-lesson-type-from" className={PRICE_LABEL}>{LESSON_TYPE_FROM_LABEL}</label>
            <input
              id="group-lesson-type-from"
              type="date"
              value={validFrom}
              min={range.min}
              max={range.max}
              onChange={(event) => { setError(null); setValidFrom(event.target.value); }}
              className={`${PRICE_FIELD} sm:w-1/2`}
            />
          </div>

          {problem && <p role="alert" className="text-xs font-medium text-rose-700">{problem}</p>}

          {noop && !problem && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-700">
              Такой тип с этого дня уже действует — менять нечего.
            </p>
          )}

          {check.request && !noop && (
            <div aria-live="polite" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs text-slate-700" data-testid="lesson-type-impact">
              <p className="font-semibold text-slate-800">Что изменится</p>
              {checking || (!shown && !checkError) ? (
                <p className="inline-flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Считаем последствия…</p>
              ) : checkError ? (
                <p role="alert" className="text-rose-700">
                  {checkError}{" "}
                  <button type="button" onClick={() => { setImpact(null); setImpactNonce((value) => value + 1); }} className="font-semibold underline">Повторить</button>
                </p>
              ) : (
                <>
                  <p>{LESSON_TYPE_IMPACT_TEXT}</p>
                  {stale ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p>{stale.text}</p>
                        {stale.items.length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-4" data-testid="lesson-type-stale">
                            {stale.items.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">{LESSON_TYPE_NO_SHEETS_TEXT}</p>
                  )}
                </>
              )}
              {past && <p className="text-slate-500">{past}</p>}
            </div>
          )}

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
