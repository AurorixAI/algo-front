/**
 * «Деньги-1» I-5: the confirmation of an action that moves money shows what it does BEFORE the person presses the button - the answer of the server to a dry run
 * (the impact of a correction, the return of a lesson with `dryRun`, the decision on an excuse with `dry_run`).  One race-safe asker for all of them (LESSONS 89): the answer of an older ask is
 * dropped (the sequence), a request that does not answer in time counts as failed (the window never waits for it forever) and is aborted.
 *
 * Pure (no React): the hook lives in `use-money-preview.ts`, so node:test drives this file with fake timers.
 */
import { periodClosedOf } from "./closed-period";
import { EFFECTS_LOADING_TEXT, moneyEffectsOf, type MoneyEffects } from "./money-effects";
import type { RequestSequence } from "./request-sequence";

/** The dry run that has not answered by now counts as failed. */
export const EFFECTS_TIMEOUT_MS = 10000;
export const EFFECTS_TIMEOUT_TEXT = "Расчёт не отвечает. Проверьте связь и повторите.";

export type EffectsPreview =
  | { status: "idle" }
  | { status: "loading" }
  /** `effects` null: the server sent no block (an older one) - nothing is claimed about the money. */
  | { status: "ready"; effects: MoneyEffects | null; /** The whole answer of the dry run (a transfer reads its `carried` from it). */ answer?: unknown }
  | { status: "failed"; error: unknown };

export const IDLE_PREVIEW: EffectsPreview = { status: "idle" };

export interface EffectsRun {
  /** The dry run; it must stop when `signal` is aborted. */
  load: (signal: AbortSignal) => Promise<unknown>;
  sequence: RequestSequence;
  onReady: (effects: MoneyEffects | null, answer?: unknown) => void;
  onFailed: (error: unknown) => void;
}

/**
 * One ask.  The answer is applied only if no newer ask has started since; a request that does not answer in time fails (its late answer is dropped).
 * The returned function cancels the ask: it stops the timer, ABORTS the request in flight and invalidates its answer.
 */
export function startEffectsRun(run: EffectsRun, timeoutMs: number = EFFECTS_TIMEOUT_MS): () => void {
  const token = run.sequence.next();
  const live = () => run.sequence.isCurrent(token);
  const controller = new AbortController();
  const giveUp = setTimeout(() => {
    if (!live()) return;
    run.sequence.next();
    controller.abort();
    run.onFailed(Object.assign(new Error(EFFECTS_TIMEOUT_TEXT), { code: "EFFECTS_TIMEOUT" }));
  }, timeoutMs);
  run.load(controller.signal)
    .then((answer) => {
      if (!live()) return;
      clearTimeout(giveUp);
      run.onReady(moneyEffectsOf(answer), answer);
    })
    .catch((error) => {
      if (!live() || controller.signal.aborted) return;
      clearTimeout(giveUp);
      run.onFailed(error);
    });
  return () => {
    clearTimeout(giveUp);
    run.sequence.next();
    controller.abort();
  };
}

/**
 * Why the button of a confirmation is off while the answer about money is not here (UX pack, rule 3: an off main button ALWAYS says why): it is being counted / the month is closed / it could not be counted.
 * null once the answer is here.
 */
/** A refusal the server says in its own words and that «Повторить» cannot change (G3M С1: «Ученик ушёл из группы: при исправлении сумма не может быть больше N сум»). */
export function refusedInWords(error: unknown): string | null {
  const source = error as { code?: unknown; message?: unknown } | null | undefined;
  return source?.code === "PAYMENT_EXCEEDS_DEBT" && typeof source.message === "string" && source.message.trim() ? source.message.trim() : null;
}

export function effectsWhyOff(preview: EffectsPreview): string | null {
  if (preview.status === "ready") return null;
  if (preview.status === "failed" && refusedInWords(preview.error)) return refusedInWords(preview.error);
  if (preview.status === "failed") return periodClosedOf(preview.error) ? "Месяц закрыт: сначала переоткройте его" : "Не удалось посчитать, что изменится: нажмите «Повторить»";
  return EFFECTS_LOADING_TEXT;
}

/** The button of the confirmation may be pressed: the answer is here (or the server has none to give). Loading and failed hold it back. */
export function effectsAllowConfirm(preview: EffectsPreview): boolean {
  return preview.status === "ready";
}

/**
 * The confirmation of a FORM (an amount, a reason): while the form cannot be sent (`draftKey` null) there is nothing to ask and the button is as it was (a press shows what is wrong);
 * once it can be sent, the button waits for the answer about money.  The reason it waits is said by the block of the effects itself (`MoneyEffectsBlock`: «Считаем…», or the failure
 * with «Повторить») - once, not again under the field (LESSONS 87, 8).
 */
export function formAllowsConfirm(draftKey: string | null, preview: EffectsPreview): boolean {
  return draftKey === null || effectsAllowConfirm(preview);
}

