"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Chip } from "@/components/ui/chip";
import { Radio } from "@/components/ui/radio";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { ConfirmFooter, CONFIRM_FOOTER_CLASS } from "@/components/money/dialog-footer";
import { PeriodClosedNotice } from "@/components/money/period-closed-notice";
import { periodClosedOf, type PeriodClosedInfo } from "@/lib/closed-period";
import { opsErrorCode } from "@/lib/ops-errors";
import {
  WAITING_HELD_REASON, WAITING_PICK_WHY, WAITING_QUESTION, offeredOutcomes, outcomeCaption, waitingChipText, waitingDecidedToast, waitingDialogHead, waitingDialogSubtitle, waitingDialogTitle,
  type WaitingOutcome, type WaitingPreview,
} from "@/lib/lesson-rules";
import type { WaitingTarget } from "@/lib/lesson-rules";

type PreviewState = { status: "loading" } | { status: "ready"; preview: WaitingPreview } | { status: "error"; message: string } | { status: "closed"; info: PeriodClosedInfo };

/** The refusal «уже решено»: the server's own sentence («Отмену подтвердил Тимур Алиев (администратор) в 12:40: по вине центра.»). */
function alreadyDecidedMessage(failure: unknown): string | null {
  if (opsErrorCode(failure) !== "ALREADY_DECIDED") return null;
  const text = failure instanceof Error ? failure.message.trim() : "";
  return text || "Отмену уже решил другой человек.";
}

/**
 * LESSON-RULES Э2: the window of the decision of a cancellation that WAITS.  The head says who wrote what and when; the three outcomes are cards, none is chosen beforehand (the person decides what
 * really happened); under the cards stands the consequence of the chosen one, the sums are the numbers of the dry run of the server (LESSONS 143) and the button names the outcome.
 * «Уже решено» (409) and «месяц закрыт» (409 `PERIOD_CLOSED`) are their own states of the same window.
 */
export function WaitingCancelDialog({ item, onClose, onDecided, showToast }: {
  /** The row of «Замены» (all of it) or the lesson of the journal / the sheet (the lesson and the group). */
  item: WaitingTarget | null;
  onClose: () => void;
  /** The cancellation was decided (or somebody did it first): the page reads the lists again. */
  onDecided: () => void;
  showToast: (text: string, type: "success" | "error" | "warning") => void;
}) {
  const [outcome, setOutcome] = useState<WaitingOutcome | null>(null);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [decidedBy, setDecidedBy] = useState<string | null>(null);
  const sending = useRef(false);
  const token = useRef(0);
  const key = item ? `${item.group.id}|${item.lesson.lessonId}|${item.lesson.date}` : null;

  const ask = useCallback(() => {
    if (!item) return;
    const mine = ++token.current;
    setState({ status: "loading" });
    // the numbers of the confirmation «по вине центра» and the flags of the lesson (can it be given back, how old is it): one dry run, nothing is written
    orgApi.changeCancellationKind(item.group.id, { lessonDate: item.lesson.date, lessonId: item.lesson.lessonId, cancellationKind: "centre", expectedKind: "unconfirmed" }, { dryRun: true })
      .then((out) => {
        if (mine !== token.current) return;
        setState({ status: "ready", preview: out as unknown as WaitingPreview });
      })
      .catch((failure) => {
        if (mine !== token.current) return;
        const decided = alreadyDecidedMessage(failure);
        if (decided) { setDecidedBy(decided); return; }
        const closed = periodClosedOf(failure);
        if (closed) { setState({ status: "closed", info: closed }); return; }
        setState({ status: "error", message: failure instanceof Error && failure.message ? failure.message : "Не удалось посчитать последствия. Повторите попытку." });
      });
  }, [item]);

  useEffect(() => {
    token.current += 1;
    setOutcome(null);
    setProblem(null);
    setDecidedBy(null);
    setBusy(false);
    sending.current = false;
    if (key) ask();
  }, [key, ask]);

  const preview = state.status === "ready" ? state.preview : null;
  const options = offeredOutcomes(preview);
  const chosen = options.find((option) => option.key === outcome) ?? null;
  // «Урок был» is not offered to a lesson that cannot be given back: a chosen one that vanished is no choice
  const picked = chosen ? chosen.key : null;
  const needsPreview = picked === "centre" || picked === "held";
  const ready = picked !== null && (!needsPreview || state.status === "ready");

  const confirm = async () => {
    if (!item || !picked || sending.current || !ready) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      if (picked === "held") {
        await orgApi.restoreLesson(item.group.id, { lessonId: item.lesson.lessonId, lessonDate: item.lesson.date, reason: WAITING_HELD_REASON, expectedKind: "unconfirmed" });
      } else {
        await orgApi.changeCancellationKind(item.group.id, { lessonDate: item.lesson.date, lessonId: item.lesson.lessonId, cancellationKind: picked, expectedKind: "unconfirmed" });
      }
      showToast(waitingDecidedToast(picked), "success");
      onDecided();
      onClose();
    } catch (failure) {
      const decided = alreadyDecidedMessage(failure);
      const closed = periodClosedOf(failure);
      if (decided) { setDecidedBy(decided); onDecided(); }
      else if (closed) setState({ status: "closed", info: closed });
      else setProblem(failure instanceof Error && failure.message ? failure.message : "Не удалось сохранить решение. Данные не изменены — повторите попытку.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const close = () => { if (!busy) onClose(); };
  const caption = picked ? outcomeCaption(picked, preview) : null;
  const finished = decidedBy !== null || state.status === "closed";

  return (
    <Modal
      open={item !== null}
      title={decidedBy !== null ? "Отмена уже решена" : item ? waitingDialogTitle(item) : ""}
      description={item ? waitingDialogSubtitle(item) : undefined}
      onClose={close}
      busy={busy}
      size="lg"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={item ? (
        finished
          ? <ConfirmFooter primary={null} cancelLabel="Закрыть" onCancel={close} />
          : <ConfirmFooter
              primary={chosen?.button ?? "Подтвердить"}
              onPrimary={() => void confirm()}
              testId="waiting-confirm"
              disabled={!ready}
              busy={busy}
              why={picked === null ? WAITING_PICK_WHY : state.status === "error" ? "Не удалось посчитать последствия" : "Считаем последствия"}
              onCancel={close}
            />
      ) : null}
    >
      {item && decidedBy !== null && (
        <p role="alert" data-testid="waiting-decided" className="flex items-start gap-2 text-sm text-slate-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>{decidedBy}</span>
        </p>
      )}
      {item && decidedBy === null && state.status === "closed" && (
        <PeriodClosedNotice info={state.info} purpose="decision" onReopened={ask} />
      )}
      {item && decidedBy === null && state.status !== "closed" && (
        <div className="space-y-3 text-sm text-slate-700">
          {item.cancelledBy && (
            <div data-testid="waiting-head" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <p className="min-w-0 break-words text-slate-800">{waitingDialogHead(item)}</p>
              {typeof item.waitingDays === "number" && <Chip tone="warn" testId="waiting-chip" className="whitespace-nowrap">{waitingChipText(item.waitingDays)}</Chip>}
            </div>
          )}
          <fieldset className="space-y-2" data-testid="waiting-outcomes">
            <legend className="mb-1.5 block w-full text-sm font-semibold text-slate-900">{WAITING_QUESTION}</legend>
            {options.map((option) => (
              <label
                key={option.key}
                data-testid={`waiting-outcome-${option.key}`}
                className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 ${picked === option.key ? "border-primary-400 bg-primary-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <Radio name="waiting-outcome" checked={picked === option.key} onChange={() => { setOutcome(option.key); setProblem(null); }} disabled={busy} />
                <span className="text-sm font-semibold text-slate-900">{option.label}</span>
              </label>
            ))}
          </fieldset>
          {picked !== null && (
            <div data-testid="waiting-caption" aria-live="polite" className="min-h-5 text-sm text-slate-800">
              {caption ?? (state.status === "error"
                ? <span className="flex flex-wrap items-center gap-2 text-amber-900">{state.message}<Button type="button" onClick={ask} variant="secondary" size="sm">Повторить</Button></span>
                : <SkeletonLine className="w-2/3" />)}
            </div>
          )}
          {problem && <Notice variant="warning" role="alert" testId="waiting-problem">{problem}</Notice>}
        </div>
      )}
    </Modal>
  );
}
