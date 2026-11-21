"use client";

import { isStaleRefusal, REFRESH_LABEL, formAllowsConfirm } from "@/lib/money-preview";
import { useState, useEffect, useMemo, useRef } from "react";
import { X, Search, Loader2, GraduationCap, RotateCcw } from "lucide-react";
import { orgApi, type GroupJoinMode } from "@/lib/api";
import {
  checkEnrolOverride,
  formatPrice,
  groupPriceHref,
  priceLabelOf,
  targetGroupPriceHint,
  type GroupPriceBrief,
  priceNotInForceText,
} from "@/lib/group-price";
import { useScheduledGroupPrices } from "@/lib/use-scheduled-group-prices";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { TransferPreviewBlock } from "./transfer-preview-block";
import { GroupPickCard } from "./group-pick-card";
import type { ScheduleSlotLike } from "@/lib/group-schedule-line";
import { Notice } from "@/components/ui/notice";
import { assignDoneToast, type EnrolToast } from "@/lib/group-enrol";
import { pastBalancesOf } from "@/lib/past-balances";
import { workspaceBases, workspaceOfPath } from "@/lib/ia-links";
import { BALANCE_CHANGED_TEXT, expectedCarriedOf, isBalanceChanged, leaveUndoOf } from "@/lib/transfer-effects";
import { SOURCE_LABEL, SOURCE_PLACEHOLDER, SOURCE_WHY, sourcesFromError, transferSource, type SourceGroup } from "@/lib/transfer-source";
import { splitTransferNotes } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { openingOffered } from "@/lib/openings";
import { useOpeningsSummary } from "@/lib/openings-summary";
import { buildOpeningIn, emptyOpeningValues, isReasonRequired, logicaError, validateOpening, validateOpeningReason, type OpeningFormValues } from "@/lib/payments-logica";
import { formatBusinessDate } from "@/lib/business-time";
import { normalizeBilling, payFromErrorText, payFromIsPast, payFromProblem, payFromRange, payFromRequest, payStartOf, PAY_FROM_NOTHING_NOW } from "@/lib/pay-from";
import { usePayFromDefault, usePayFromPreview } from "@/lib/use-pay-from";
import { EnrolTerms } from "./enrol-terms";
import { BarDetails, BarMoreButton } from "./enrol-bar-details";
import { EnrolExceptions, EnrolNoteRows, EnrolRefusedRow, ExceptionRow } from "./enrol-exceptions";
import { enrolBarOf, enrolIntoLabel, forecastBarWords } from "@/lib/enrol-bar";
import { forecastBarOf, resultMoneyLines, upcomingMessageOf, upcomingOf } from "@/lib/paytails-contract";
import { dryRunOverride, isOwnPrice, ownPriceError, payStartsLine, type OwnPriceError } from "@/lib/enrol-terms";
import { probeRefusalOfError } from "@/lib/bulk-outcome";
import { formatMoney } from "@/lib/money-format";
import { enrolCardTitle, groupNameShown, serverPhraseShown } from "@/lib/enrol-labels";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SummaryBar } from "@/components/ui/summary-bar";

export interface GroupInfo {
  id: string;
  name: string;
  class_level: number;
  teacher_id?: string | null;
  teacher_name?: string | null;
  status?: string;
  max_students?: number;
  student_count?: number;
  students_count?: number;
  /** The price of the group today; the key is absent for a role that does not see money. */
  price_current?: GroupPriceBrief | null;
  /** The weekly schedule of the group (the list of the groups sends it): the card shows it as one line. */
  schedule?: ReadonlyArray<ScheduleSlotLike> | null;
}

interface AssignGroupModalProps {
  open: boolean;
  studentId: string;
  studentName: string;
  studentGrade?: number;
  /**
   * "transfer" (default) closes the other memberships and makes the chosen group the main one;
   * "add" keeps them: the student attends one more group.
   */
  mode?: GroupJoinMode;
  /** When supplied, this is a transfer rather than first enrolment. */
  currentGroupId?: string | null;
  currentGroupName?: string | null;
  /** Every group the student already attends: none of them is a valid destination. */
  excludeGroupIds?: string[];
  /** Money-2 T1: the active groups a transfer may leave (the caller knows them). Several: the person chooses «Из какой группы»; one: it is the source; none: the server says (422) when it needs the choice. */
  sourceGroups?: SourceGroup[];
  /** Where the group pages of this workspace live (`/owner/groups`): the link «Задать цену группы» leads there. */
  groupsBasePath?: string;
  onClose: () => void;
  /** The window closes itself after a successful write: the caller shows `done` as its ordinary message (toast). */
  onAssigned: (group?: GroupInfo | null, done?: EnrolToast) => void;
}


export function AssignGroupModal({
  open,
  studentId,
  studentName,
  studentGrade,
  mode = "transfer",
  currentGroupId = null,
  currentGroupName = null,
  excludeGroupIds,
  sourceGroups,
  groupsBasePath,
  onClose,
  onAssigned,
}: AssignGroupModalProps) {
  const isAdd = mode === "add";
  const isTransfer = !isAdd && Boolean(currentGroupId || currentGroupName);
  const excluded = useMemo(() => new Set([...(excludeGroupIds ?? []), ...(currentGroupId ? [currentGroupId] : [])]), [excludeGroupIds, currentGroupId]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [search, setSearch] = useState("");
  // Money-2 fix 12 (Д8): the height of the list as it was with the full list, taken at the FIRST input in the search; it stays the minimum while the window is open and no group is chosen,
  // so the window does not breathe with every letter (no empty box at the opening: until the first input the height is the content's)
  const listRef = useRef<HTMLDivElement>(null);
  const [listMin, setListMin] = useState<number | null>(null);
  const typeSearch = (next: string) => {
    if (listMin === null && next && !selectedGroupId && listRef.current) setListMin(Math.ceil(listRef.current.getBoundingClientRect().height));
    setSearch(next);
  };
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  // a refusal of the price / the day / the opening balance opens the conditions in place
  const [termsSignal, setTermsSignal] = useState(0);
  // the refusal of the own price stands AT its field (the panel opens itself); an edit of the field takes it away
  const [priceError, setPriceError] = useState<OwnPriceError | null>(null);
  // Money-2 fix 3: 409 `TRANSFER_SOURCE_GONE` - the words of the server once and one action, «Обновить»
  const [assignmentStale, setAssignmentStale] = useState(false);
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const scheduledPrices = useScheduledGroupPrices(open && moneyAvailable && groups.some((g) => g.price_current === null));      // G3M Ф6: a price planned from a day is not «не задана»
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  // An individual price is an exception: a sum that is not the price of the group, and then a reason.
  const [exceptionAmount, setExceptionAmount] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  // LOGIC-A decision 1: «оплачено до» / «долг на дату» of the new membership; not with a transfer (the server refuses it).
  // Money-2 R3c Г1: once the accounting has started only the owner puts an opening balance - the summary (shared with the other pieces of the screen: one request) says so, the screen does not guess the role
  const { summary: openingsSummary } = useOpeningsSummary(moneyAvailable);
  const openingShown = openingOffered(moneyAvailable, openingsSummary);
  const [openingOn, setOpeningOn] = useState(false);
  const [opening, setOpening] = useState<OpeningFormValues>(emptyOpeningValues);
  const [openingNeedsReason, setOpeningNeedsReason] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  // Money-2 T1: «Из какой группы» - the groups the transfer may leave (the caller's, or the list of the server's refusal) and the choice (none by default)
  const [fromGroupId, setFromGroupId] = useState("");
  const [serverSources, setServerSources] = useState<SourceGroup[] | null>(null);
  // Money-2 T5: the server refused the write because the money changed after the dry run (409 BALANCE_CHANGED): the numbers are asked again
  const [balanceChanged, setBalanceChanged] = useState(false);
  // «По периодам» of the bar
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const sources = serverSources ?? sourceGroups ?? (currentGroupId ? [{ id: currentGroupId, name: currentGroupName ?? "" }] : []);
  const source = isTransfer ? transferSource(sources, fromGroupId) : { needed: false, id: null };
  // Money-1 B1 «Оплата с»: the day the student is charged from in the chosen group ("" until the default of that group arrives); a transfer has no such field
  const [payFrom, setPayFrom] = useState("");

  // Load the groups when opened
  useEffect(() => {
    if (open) {
      let cancelled = false;
      setLoading(true);
      setSelectedGroupId(null);
      setAssignmentError(null);
      setLoadError(null);
      setSearch("");
      setListMin(null);
      setExceptionAmount("");
      setExceptionReason("");
      setPriceError(null);
      setOpeningOn(false);
      setOpening(emptyOpeningValues());
      setOpeningNeedsReason(false);
      setPayFrom("");
      setFromGroupId("");
      setServerSources(null);

      orgApi.listGroups()
        .then((groupsData) => {
          if (cancelled) return;
          const rawGroups: GroupInfo[] = Array.isArray(groupsData)
            ? groupsData
            : (groupsData as any)?.items || [];
          setGroups(rawGroups.filter((g) => g.status !== "archived"));
        })
        .catch((error) => {
          if (!cancelled) setLoadError(getDataLoadErrorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => { cancelled = true; };
    }
  }, [open, reloadNonce]);

  const currentGroup = useMemo(
    () => groups.find((group) => group.id === currentGroupId) || null,
    [groups, currentGroupId],
  );

  const currentGroupLabel = isAdd ? currentGroupName : (currentGroup?.name || currentGroupName);

  // The current group remains visible in the line under the title.  It is never a
  // valid destination for a transfer and therefore does not appear among
  // selectable target groups.  One search: the name, the class and the teacher.
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (excluded.has(g.id)) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = g.name.toLowerCase().includes(q);
        const matchesGrade = String(g.class_level).includes(q) || `${g.class_level} класс`.toLowerCase().includes(q);
        const matchesTeacher = g.teacher_name ? g.teacher_name.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesGrade && !matchesTeacher) {
          return false;
        }
      }
      return true;
    });
  }, [groups, excluded, search]);

  const handleAssign = async () => {
    if (!selectedGroupId || assigning || !transferAllowed || (source.needed && !source.id)) return;
    if (excluded.has(selectedGroupId)) {
      setAssignmentError("Ученик уже состоит в выбранной группе. Выберите другую группу.");
      return;
    }
    // an own price without its reason: the error stands at that field (the conditions open by themselves), nothing is sent
    const priceProblem = moneyAvailable && leaveUndo?.undone !== true ? ownPriceError({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : null;
    if (priceProblem) { setPriceError(priceProblem); setTermsSignal((n) => n + 1); return; }
    const exception = moneyAvailable && leaveUndo?.undone !== true
      ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason })
      : { error: null, request: null };
    if (exception.error) { setAssignmentError(exception.error); setTermsSignal((n) => n + 1); return; }
    if (payProblem) { setAssignmentError(payProblem); setTermsSignal((n) => n + 1); return; }
    const todayDate = formatBusinessDate();
    const withOpening = openingShown && !isTransfer && openingOn && leaveUndo?.undone !== true;
    if (withOpening) {
      const problem = validateOpening(opening, { enrolDate: todayDate, accountingStart, today: todayDate });
      if (problem) { setAssignmentError(problem); setTermsSignal((n) => n + 1); return; }
      const reasonProblem = openingNeedsReason ? validateOpeningReason(opening.reason) : null;
      if (reasonProblem) { setAssignmentError(reasonProblem); setTermsSignal((n) => n + 1); return; }
    }
    setAssigning(true);
    setAssignmentError(null);
    setBalanceChanged(false);
    try {
      const result = await orgApi.addStudentToGroup(selectedGroupId, studentId, {
        mode,
        price_override: leaveUndo?.undone === true ? null : exception.request,
        opening_balance: withOpening ? buildOpeningIn(opening) : null,
        pay_from: payBody,
        from_group_id: source.id,
        // T5: the sum the window showed (only with the right to money: without it the server sends no sum)
        expected_carried: isTransfer && moneyAvailable ? expectedCarriedOf(transferPreview.preview.status === "ready" ? transferPreview.preview.answer : null) : null,
      });
      if (result.status === "unchanged") {
        setSelectedGroupId(null);
        setAssignmentError(isAdd ? "Ученик уже состоит в этой группе." : "Ученик уже состоит в этой группе. Перевод не выполнен.");
        return;
      }
      const notes = splitTransferNotes(result.warnings);
      // the server's sentence about the day the charge starts (only when the person chose it)
      const billingLine = payBody ? normalizeBilling(result.billing)?.text : "";
      // after the action: the server's words about a student who came back as he was (before it the window says nothing - «как было» is the expected result)
      const undoDone = leaveUndoOf(result);
      const targetGroup = groups.find((g) => g.id === selectedGroupId) || null;
      // Money-2 fix10В: no second window - the window closes and the page shows ONE message (a headline and, only when there is something to say, a second line)
      const done = assignDoneToast({
        studentName,
        groupName: targetGroup?.name ?? "",
        transfer: isTransfer,
        undoText: undoDone?.undone ? undoDone.text : null,
        // the sum of the last probe, as the window of a group says it (only for a role that sees money; no sum - no line)
        payNowLine: bar && bar.words.length > 0 ? `${bar.words.join(" · ")} — на странице «Оплаты»` : null,
        moneyLines: [...resultMoneyLines(result), ...(upcomingMessageOf(result) ? [upcomingMessageOf(result) as string] : [])],
        stays: isAdd ? (sourceGroups ?? []).filter((g) => g.id !== selectedGroupId).map((g) => g.name).filter(Boolean) : [],
        warnings: notes.warnings,
        infos: billingLine ? [...notes.infos, billingLine] : notes.infos,
      });
      onAssigned(targetGroup, done);
      onClose();
    } catch (e: any) {
      if (isBalanceChanged(e)) { setBalanceChanged(true); transferPreview.retry(); return; }
      const askedSources = sourcesFromError(e);
      if (askedSources) { setServerSources(askedSources); setFromGroupId(""); }
      const failure = logicaError(e);
      setAssignmentStale(isStaleRefusal(e));
      if (isReasonRequired(failure) && openingOn) setOpeningNeedsReason(true);
      const fieldError = payFromErrorText(failure) || (isReasonRequired(failure) && openingOn ? `${failure.message}. Укажите причину ниже.` : null);
      if (fieldError) setTermsSignal((n) => n + 1);
      setAssignmentError(fieldError || failure.message || (isAdd ? "Не удалось зачислить ученика в группу" : isTransfer ? "Не удалось перевести ученика в группу" : "Не удалось зачислить ученика в группу"));
    } finally {
      setAssigning(false);
    }
  };

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) ?? null, [groups, selectedGroupId]);
  const groupAmount = selectedGroup?.price_current ? selectedGroup.price_current.amount : null;
  const exceptionOn = isOwnPrice(exceptionAmount, groupAmount);
  // R3 #15: «что переедет» - the dry run of the same transfer, asked when the group is chosen; «Перевести» waits for it (a first enrolment carries nothing: no ask)
  // an own price without its reason is asked with the stand-in reason of a dry run, so the sum follows the price on the screen; the real write never goes without it
  const dryException = moneyAvailable ? dryRunOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : { error: null, request: null };
  const transferKey = isTransfer && selectedGroupId && !excluded.has(selectedGroupId) && !dryException.error && !(source.needed && !source.id)
    ? `${selectedGroupId}|${studentId}|${source.id ?? ""}|${JSON.stringify(dryException.request)}`
    : null;
  const transferPreview = useFormMoneyPreview(transferKey, (signal) => (selectedGroupId ? orgApi.dryRunTransferStudent(selectedGroupId, studentId, { price_override: dryException.request, from_group_id: source.id }, signal) : Promise.reject(new Error("no group"))));
  // the server asks for the choice (the caller did not know the groups): its list becomes the selector
  const askedInDryRun = transferPreview.preview.status === "failed" ? sourcesFromError(transferPreview.preview.error) : null;
  useEffect(() => { if (askedInDryRun) { setServerSources(askedInDryRun); setFromGroupId(""); } }, [askedInDryRun]);
  const transferAllowed = formAllowsConfirm(transferKey, transferPreview.preview);
  // Money-2 T6: coming back the day of the leaving - the dry run of the add says whether the leaving is undone (a transfer says it in its own answer)
  const addKey = !isTransfer && selectedGroupId && !excluded.has(selectedGroupId) && !dryException.error ? `${selectedGroupId}|${studentId}|${JSON.stringify(dryException.request)}` : null;
  const addPreview = useFormMoneyPreview(addKey, (signal) => orgApi.dryRunAddStudent(selectedGroupId as string, studentId, { price_override: dryException.request }, signal));
  const undoSource = transferKey !== null ? transferPreview.preview : addKey !== null ? addPreview.preview : null;
  const leaveUndo = undoSource?.status === "ready" ? leaveUndoOf(undoSource.answer) : null;

  // Money-1 B1: «Оплата с» for ADDING (not a transfer): the default of the chosen group; a past day - the dry run says what is charged at once
  // Money-2 (server, review): coming back the day of the leaving cancels it - «Оплата с» and the opening balance cannot be set then (the note of the server above says so)
  const leavingUndone = leaveUndo?.undone === true;
  const payFromAllowed = !isTransfer && !leavingUndone && Boolean(selectedGroupId) && !(selectedGroupId && excluded.has(selectedGroupId));
  const { def: payDef } = usePayFromDefault(selectedGroupId ?? "", open && payFromAllowed);
  useEffect(() => { setPayFrom(payDef ? payDef.default_pay_from : ""); }, [payDef]);
  // the default is there from the first frame the server answered (no flash of an empty date)
  const payFromValue = payFrom || payDef?.default_pay_from || "";
  const payBody = payFromAllowed ? payFromRequest(payFromValue, payDef, moneyAvailable) : null;
  const payProblem = payFromAllowed && moneyAvailable ? payFromProblem(payFromValue, payDef, payFromRange(payDef?.today ?? formatBusinessDate(), accountingStart)) : null;
  const payPreviewKey = open && moneyAvailable && payFromAllowed && payDef !== null && selectedGroupId && !dryException.error && !payProblem
    ? `${selectedGroupId}|${studentId}|${payBody ?? ""}|${JSON.stringify(dryException.request)}` : null;
  const payPreview = usePayFromPreview(payPreviewKey, (signal) => orgApi.dryRunAddStudent(selectedGroupId as string, studentId, { pay_from: payBody, price_override: dryException.request }, signal));

  const selectedPriceNote = selectedGroup ? targetGroupPriceHint(selectedGroup.price_current, 1, scheduledPrices[selectedGroup.id]) : null;
  const paymentsBase = groupsBasePath && moneyAvailable ? workspaceBases(workspaceOfPath(groupsBasePath)).payments : null;

  const verb = isTransfer ? "transfer" : "enrol";
  const formTitle = enrolCardTitle(isTransfer, studentName);
  // the sum at once (one student, a first enrolment or one more group): the fields of the probe, the words are arranged in `enrolBarOf`
  const sums = moneyAvailable && payFromAllowed && Boolean(payDef);
  const counting = sums && payPreview.status === "loading";
  // a refusal of the probe in the server's words (a full group, a day before his last stay): said before the button as the student who will not be written; any other failure is «Повторить»
  const refusedWords = sums && payPreview.status === "failed" ? probeRefusalOfError(payPreview.error) : null;
  const failed = sums && payPreview.status === "failed" && refusedWords === null;
  const ready = sums && payPreview.status === "ready" ? payPreview : null;
  const row = ready?.immediate.rows[0];
  const barRows = [{ id: studentId, name: studentName, amount: row?.amount ?? null, parts: row?.parts ?? [], lines: row?.lines ?? [] }];
  const bar = ready ? enrolBarOf(barRows) : null;
  const noPrice = moneyAvailable && selectedGroup !== null && selectedGroup.price_current === null;
  const whyOff = source.needed && !source.id ? SOURCE_WHY : !transferAllowed ? "Кнопка включится, когда будет посчитано, что изменится" : payProblem;
  // nobody pays at once because the day of the charge is ahead: the muted line says when it starts (the day is the server's `pay_from`)
  const payStart = ready ? payStartOf(ready.answer) : null;
  // PAY-TAILS Б2.5: the charge STARTS LATER (`upcoming` of the probe): the bar says «Начисление с 24 ноября», the forecast sum of the server and the lessons / the term under it
  const forecast = ready && bar && bar.total === null ? forecastBarOf([upcomingOf(ready.answer)], null) : null;
  const forecastWords = forecast ? forecastBarWords(forecast, payDef?.today ?? formatBusinessDate()) : null;
  const forecastSum = forecastWords?.totalText ? forecastWords : null;
  const idle = !selectedGroupId ? "Выберите группу"
    : noPrice ? "Сумма появится, когда у группы будет цена"
    : failed ? "Не удалось посчитать, сколько начислится сразу"
    : counting ? "Считаем…"
    : bar && bar.total === null && payFromIsPast(payFromValue, payDef) ? PAY_FROM_NOTHING_NOW
    : forecastWords && !forecastSum ? <span className="whitespace-nowrap">{forecastWords.caption}</span>
    : bar && bar.total === null && payStart && payStart > (payDef?.today ?? formatBusinessDate()) ? <span className="whitespace-nowrap">{payStartsLine(payStart, payDef?.today ?? formatBusinessDate())}</span>
    : null;
  const line = failed
    ? <button type="button" onClick={payPreview.retry} data-testid="pay-from-retry" className="font-semibold text-primary-700 underline">Повторить</button>
    : whyOff ? <span id="assign-why" data-testid="assign-why">{whyOff}</span>
    : forecastSum?.line ? forecastSum.line
    : bar && bar.total !== null && (bar.line || bar.expandable) ? <>{bar.line}{bar.expandable && <>{" "}<BarMoreButton rows={barRows} open={periodsOpen} onToggle={() => setPeriodsOpen((value) => !value)} /></>}</> : null;
  const buttonText = assigning ? (isTransfer ? "Переводим…" : "Зачисляем…") : selectedGroup ? enrolIntoLabel(selectedGroup.name, verb) : isTransfer ? "Перевести" : "Зачислить";
  const submitOff = !selectedGroupId || excluded.has(selectedGroupId) || assigning || !transferAllowed || payProblem !== null || (source.needed && !source.id) || counting || refusedWords !== null;
  const notes = addPreview.preview.status === "ready" ? pastBalancesOf(addPreview.preview.answer) : [];
  const undoNote = leaveUndo ? { id: studentId, name: null, past: notes, rewrite: leaveUndo.undone ? null : leaveUndo, undone: leaveUndo.undone ? leaveUndo : null } : { id: studentId, name: null, past: notes, rewrite: null, undone: null };
  const needsNotes = notes.length > 0 || leaveUndo !== null;

  return (
    <Modal
      open={open}
      title={formTitle}
      description={(
        // who and from where on ONE line under the title
        <span data-testid="assign-current-group">
          {/* the dot stays with the class (a non-breaking space before it): a wrapped line never starts with it */}
          {studentGrade ? <><span data-testid="assign-grade">{studentGrade} класс</span>{((isTransfer && !source.needed) || (isAdd && currentGroupLabel)) ? "\u00a0· " : ""}</> : null}
          {((isTransfer && !source.needed) || (isAdd && currentGroupLabel)) && (
            <span data-testid="assign-current-caption">
              {isAdd ? "уже занимается в" : "сейчас в"} «<span className="[overflow-wrap:anywhere]">{currentGroupLabel ? groupNameShown(currentGroupLabel) : "…"}</span>»
            </span>
          )}
        </span>
      )}
      onClose={onClose}
      busy={assigning}
      size="md"
      bodyClassName="overflow-y-auto overscroll-contain min-h-0 flex flex-col"
      footerClassName="flex flex-col"
      footer={(
        <>
          {assignmentError && (
            <div role="alert" className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium leading-relaxed text-rose-800 max-sm:mx-4">
              <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{serverPhraseShown(assignmentError)}</span>
              {assignmentStale && <Button type="button" variant="secondary" size="sm" data-testid="assign-refresh" onClick={() => { onClose(); window.location.reload(); }}>{REFRESH_LABEL}</Button>}
            </div>
          )}
          {/* «По периодам»: opens here, over the bar, in view on every width (a part of the pinned block, at most 40% of the screen, its own scroll) */}
          {bar?.expandable && periodsOpen && <BarDetails rows={barRows} />}
          <SummaryBar
            label={forecastSum ? [forecastSum.caption] : bar?.captions}
            amount={forecastSum ? forecastSum.totalText : bar && bar.total !== null ? bar.totalText : null}
            unit={forecastSum ? forecastSum.unit : bar?.unit}
            idle={idle}
            line={line}
            action={<Button type="button" size="lg" onClick={() => void handleAssign()} disabled={submitOff} loading={assigning} data-testid="assign-submit" title={buttonText} aria-describedby={selectedGroupId && whyOff ? "assign-why" : undefined} className="h-auto max-w-[18rem] whitespace-normal text-center max-sm:max-w-full"><span className="line-clamp-2 [overflow-wrap:anywhere]">{buttonText}</span></Button>}
          />
        </>
      )}
    >
      {/* Who and from where: the source (a transfer from one of several groups), the search, the cards of the groups */}
      <div className="px-5 pb-2 pt-1 max-sm:px-4">
        {source.needed && (
          <div data-testid="assign-source" className="mb-3">
            <label htmlFor="assign-group-source" className="mb-1 block text-xs font-semibold text-slate-600">{SOURCE_LABEL}</label>
            <Select
              id="assign-group-source"
              value={source.id ?? ""}
              placeholder={SOURCE_PLACEHOLDER}
              onChange={(e) => { setAssignmentError(null); setFromGroupId(e.target.value); }}
              options={sources.map((group) => ({ value: group.id, label: group.name }))}
              buttonClassName="bg-white py-2.5 pl-3.5"
            />
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id="assign-group-search"
            type="text"
            placeholder="Группа или преподаватель"
            aria-label="Группа или преподаватель"
            value={search}
            onChange={(e) => typeSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-500 focus:border-transparent focus:ring-2 focus:ring-primary-500"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Очистить поиск" className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-700">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* the minimal height of the list is taken at the first input in the search (`listMin`): the window does not jump while the person types and the found cards come and go */}
        <div ref={listRef} className="mt-3" style={listMin !== null && !selectedGroupId ? { minHeight: listMin } : undefined} data-testid="assign-groups" role="radiogroup" aria-label="Группа">
          {loading ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center text-slate-600">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary-500" aria-hidden="true" />
              <p className="text-xs font-medium">Загрузка доступных групп...</p>
            </div>
          ) : loadError ? (
            <div className="flex min-h-[120px] items-center justify-center px-3">
              <DataLoadError compact title="Не удалось загрузить группы" message={loadError} onRetry={() => setReloadNonce((current) => current + 1)} />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className={`flex flex-col items-center justify-center px-4 text-center ${search ? "py-2" : "min-h-[120px] py-3"}`}>
              {!search && <GraduationCap className="mb-3 h-8 w-8 text-slate-500" aria-hidden="true" />}
              <h4 className="mb-1 text-sm font-bold text-slate-800">
                {search ? "Группы не найдены" : isTransfer ? "Нет группы для перевода" : isAdd ? "Нет других групп" : "Нет активных групп"}
              </h4>
              <p className={`max-w-xs text-xs text-slate-600 ${search ? "mb-2" : "mb-4"}`}>
                {search
                  ? "Попробуйте изменить поиск."
                  : isTransfer
                    ? "Ученик уже состоит в единственной доступной активной группе."
                    : "В организации пока не создано ни одной учебной группы."}
              </p>
              {search && (
                <Button onClick={() => setSearch("")} variant="secondary" size="sm">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Сбросить поиск
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGroups.map((g) => (
                <GroupPickCard
                  key={g.id}
                  group={g}
                  selected={selectedGroupId === g.id}
                  gradeMismatch={Boolean(studentGrade && g.class_level && g.class_level !== studentGrade)}
                  priceText={moneyAvailable && g.price_current !== undefined ? (g.price_current ? formatPrice(g.price_current.amount, priceLabel) : priceNotInForceText(scheduledPrices[g.id], "цена не задана")) : ""}
                  priceMissing={!g.price_current && !scheduledPrices[g.id]}
                  onSelect={() => { setSelectedGroupId(g.id); setAssignmentError(null); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Special: only when there is something to say about THIS student and THIS group */}
      {selectedGroup && (noPrice || needsNotes || transferKey !== null || balanceChanged || refusedWords !== null) && (
        <EnrolExceptions>
          {refusedWords !== null && <EnrolRefusedRow id={studentId} name={studentName} reason={refusedWords} />}
          {noPrice && (
            <ExceptionRow
              tone="warn"
              testId="assign-price-missing"
              aside={groupsBasePath ? <a href={groupPriceHref(groupsBasePath, selectedGroup.id)} className="inline-flex min-h-8 items-center text-sm font-semibold text-primary-700 hover:underline max-sm:min-h-10">{scheduledPrices[selectedGroup.id] ? "Цена группы" : "Задать цену"}</a> : undefined}
            >
              «{selectedGroup.name}»: {priceNotInForceText(scheduledPrices[selectedGroup.id], "цена группы не задана")}
              {selectedPriceNote && <span className="mt-0.5 block text-xs text-slate-600">{selectedPriceNote}</span>}
            </ExceptionRow>
          )}
          {needsNotes && <EnrolNoteRows note={undoNote} paymentsBase={paymentsBase} />}
          {transferKey !== null && <TransferPreviewBlock preview={transferPreview.preview} onRetry={transferPreview.retry} target={selectedGroup.name} className="" />}
          {balanceChanged && <Notice variant="warning" compact testId="transfer-changed">{BALANCE_CHANGED_TEXT}</Notice>}
        </EnrolExceptions>
      )}

      {/* Conditions: one line; a role without money and a student who comes back as he was have none */}
      {moneyAvailable && selectedGroup && !leavingUndone && (
        <EnrolTerms
          idPrefix="assign-group"
          payDef={payFromAllowed ? payDef : null}
          showPayFrom={payFromAllowed}
          payFrom={payFromValue}
          onPayFrom={(next) => { setAssignmentError(null); setPayFrom(next); }}
          accountingStart={accountingStart}
          priceLabel={priceLabel}
          groupAmount={groupAmount}
          amount={exceptionAmount}
          reason={exceptionReason}
          onAmount={(text) => { setAssignmentError(null); setPriceError(null); setExceptionAmount(text); }}
          onReason={(text) => { setAssignmentError(null); setPriceError(null); setExceptionReason(text); }}
          priceError={priceError}
          whyNote={forecast?.termsNote ?? null}
          openSignal={termsSignal}
          opening={!isTransfer && openingShown ? { on: openingOn, onChange: (value) => { setAssignmentError(null); setOpeningOn(value); }, values: opening, onValues: (next) => { setAssignmentError(null); setOpening(next); }, today: formatBusinessDate(), accountingStart, needsReason: openingNeedsReason } : null}
        />
      )}
    </Modal>
  );
}
