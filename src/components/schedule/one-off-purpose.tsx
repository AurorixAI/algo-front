"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import {
  EXTRA_FREE_FOR_STUDENTS, MAKEUP_LOADING_TEXT, MAKEUP_LOAD_ERROR_TEXT, MAKEUP_MONEY_NOTE, MAKEUP_TARGET_LABEL, MAKEUP_TARGET_PLACEHOLDER, MONEY_QUESTION,
  PURPOSE_CHOICES, PURPOSE_QUESTION, candidateKey, candidateOptionLabel, makeupUnavailableText, moneyChoicesFor,
  type MakeupCandidate, type MakeupCandidates, type OneOffChoice, type OneOffRole,
} from "@/lib/one-off";

export type MakeupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: MakeupCandidates };

/**
 * The cancelled lessons of a group that can be made up (`GET /org/groups/{id}/makeup-candidates`), read when the group is known and again
 * when it changes.  An answer for a group that is not the current one any more is dropped.  `reload` is the «Повторить» of a failure.
 */
export function useMakeupCandidates(groupId: string | null | undefined, enabled: boolean): { state: MakeupState; reload: () => void } {
  const [state, setState] = useState<MakeupState>({ kind: "idle" });
  const sequence = useRef(0);
  const load = useCallback(() => {
    const mine = ++sequence.current;
    if (!enabled || !groupId) { setState({ kind: "idle" }); return; }
    setState({ kind: "loading" });
    orgApi.getMakeupCandidates(groupId)
      .then((data) => { if (mine === sequence.current) setState({ kind: "ready", data: { items: data?.items ?? [], emptyReason: data?.emptyReason ?? null } }); })
      .catch(() => { if (mine === sequence.current) setState({ kind: "error" }); });
  }, [enabled, groupId]);
  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);
  return { state, reload: load };
}

export function candidatesOf(state: MakeupState): MakeupCandidates | null {
  return state.kind === "ready" ? state.data : null;
}

const CARD = "rounded-xl border px-3 py-2.5 text-left text-xs transition-colors";

/**
 * «Что это за урок?» - the first step of the form of a one-off lesson, the same on the group page and on the teacher's schedule.
 * «Отработка отменённого урока»: the list of the cancelled lessons of the group (date, time, the reason when the server sent it); with none the
 * choice is off and says why.  «Дополнительный урок»: the money of the teacher by the role and one line that the students pay nothing.
 */
export function OneOffPurposeFields({ idPrefix, role, choice, onChoice, makeup, onReload, onPickCandidate, disabled = false, invalid = false }: {
  idPrefix: string;
  role: OneOffRole | null;
  choice: OneOffChoice;
  onChoice: (next: OneOffChoice) => void;
  makeup: MakeupState;
  onReload: () => void;
  /** A cancelled lesson was chosen: the form suggests its time. */
  onPickCandidate?: (candidate: MakeupCandidate) => void;
  disabled?: boolean;
  /** Nothing is chosen and the user tried to save. */
  invalid?: boolean;
}) {
  const ready = makeup.kind === "ready" ? makeup.data : null;
  const items = ready?.items ?? [];
  const makeupOff = makeup.kind !== "ready" || items.length === 0;
  const makeupHint =
    makeup.kind === "loading" ? MAKEUP_LOADING_TEXT
      : makeup.kind === "error" ? MAKEUP_LOAD_ERROR_TEXT
        : makeup.kind === "ready" && items.length === 0 ? makeupUnavailableText(ready)
          : null;

  // a make-up that is no longer possible (the group changed, the list came back empty) is dropped from the choice
  useEffect(() => {
    if (choice.purpose !== "makeup" || makeup.kind === "loading" || makeup.kind === "idle") return;
    if (makeup.kind === "error" || items.length === 0) { onChoice({ ...choice, purpose: null, target: "" }); return; }
    if (choice.target && !items.some((item) => candidateKey(item) === choice.target)) onChoice({ ...choice, target: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeup]);

  const moneyChoices = moneyChoicesFor(role);
  const pick = (purpose: "makeup" | "extra") => onChoice({ ...choice, purpose });
  const card = (value: "makeup" | "extra", title: string, hint: string, off: boolean, why: string | null) => {
    const on = choice.purpose === value;
    const hintId = `${idPrefix}-purpose-${value}-hint`;
    return (
      <div key={value}>
        <button
          type="button"
          role="radio"
          aria-checked={on}
          aria-disabled={off || undefined}
          aria-describedby={why ? hintId : undefined}
          disabled={disabled}
          data-testid={`${idPrefix}-purpose-${value}`}
          onClick={() => { if (!off) pick(value); }}
          className={`${CARD} w-full ${
            off ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              : on ? "border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-200"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="block font-bold">{title}</span>
          <span className="mt-0.5 block text-[11px] opacity-75">{hint}</span>
        </button>
        {why && (
          <p id={hintId} data-testid={`${idPrefix}-purpose-${value}-why`} className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
            {makeup.kind === "loading" ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden /> : <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
            <span>
              {why}
              {makeup.kind === "error" && value === "makeup" && (
                <> <button type="button" onClick={onReload} className="font-semibold text-primary-700 hover:underline">Повторить</button></>
              )}
            </span>
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <fieldset>
        <legend id={`${idPrefix}-purpose-label`} className="mb-1.5 block text-xs font-semibold text-slate-700">{PURPOSE_QUESTION}</legend>
        <div role="radiogroup" aria-labelledby={`${idPrefix}-purpose-label`} aria-invalid={invalid || undefined} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {card("makeup", PURPOSE_CHOICES[0].title, PURPOSE_CHOICES[0].hint, makeupOff, makeupHint)}
          {card("extra", PURPOSE_CHOICES[1].title, PURPOSE_CHOICES[1].hint, false, null)}
        </div>
        {invalid && choice.purpose === null && <p role="alert" className="mt-1 text-[11px] font-semibold leading-4 text-rose-600">Выберите, что это за урок</p>}
      </fieldset>

      {choice.purpose === "makeup" && ready && items.length > 0 && (
        <div>
          <label htmlFor={`${idPrefix}-makeup-target`} className="mb-1 block text-xs font-semibold text-slate-700">{MAKEUP_TARGET_LABEL}</label>
          <Select
            id={`${idPrefix}-makeup-target`}
            testId={`${idPrefix}-makeup-target`}
            value={choice.target}
            placeholder={MAKEUP_TARGET_PLACEHOLDER}
            options={items.map((item) => ({ value: candidateKey(item), label: candidateOptionLabel(item) }))}
            onChange={(event) => {
              const key = String(event.target.value);
              onChoice({ ...choice, target: key });
              const found = items.find((item) => candidateKey(item) === key);
              if (found) onPickCandidate?.(found);
            }}
            disabled={disabled}
            invalid={invalid && !choice.target}
            buttonClassName="px-3 py-2 text-xs"
          />
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{MAKEUP_MONEY_NOTE}</p>
        </div>
      )}

      {choice.purpose === "extra" && (
        <fieldset>
          <legend id={`${idPrefix}-money-label`} className="mb-1.5 block text-xs font-semibold text-slate-700">{MONEY_QUESTION}</legend>
          <div role="radiogroup" aria-labelledby={`${idPrefix}-money-label`} aria-invalid={invalid && !choice.money ? true : undefined} className="space-y-1.5">
            {moneyChoices.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40 ${
                  choice.money === option.value ? "border-primary-500 bg-primary-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <Radio
                  className="mt-0.5"
                  name={`${idPrefix}-money`}
                  value={option.value}
                  checked={choice.money === option.value}
                  disabled={disabled}
                  data-testid={`${idPrefix}-money-${option.value}`}
                  onChange={() => onChoice({ ...choice, money: option.value })}
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-800">{option.label}</span>
                  <span className="block text-[11px] leading-4 text-slate-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {invalid && !choice.money && <p role="alert" className="mt-1 text-[11px] font-semibold leading-4 text-rose-600">Выберите оплату преподавателю</p>}
          <p data-testid={`${idPrefix}-extra-free`} className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> <span>{EXTRA_FREE_FOR_STUDENTS}</span>
          </p>
        </fieldset>
      )}
    </>
  );
}
