"use client";

import { classLabel } from "@/lib/class-label";
import { namesakeDetail } from "@/lib/student-namesake";
import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { orgApi, type GroupJoinMode } from "@/lib/api";
import {
  checkEnrolOverride,
  groupPriceHref,
  priceLabelOf,
  priceNotInForceText,
  targetGroupPriceHint,
  type GroupPriceBrief,
  type GroupPriceScheduled,
} from "@/lib/group-price";
import { splitTransferNotes } from "@/lib/payments";
import { buildOpeningIn, emptyOpeningValues, isReasonRequired, logicaError, validateOpening, validateOpeningReason, type OpeningFormValues } from "@/lib/payments-logica";
import { formatBusinessDate, formatDateRu } from "@/lib/business-time";
import { formatMoney } from "@/lib/money-format";
import { normalizeBilling, normalizeBulkImmediate, payFromErrorText, payFromIsPast, payFromProblem, payFromRange, payFromRequest, payStartOf, PAY_FROM_NOTHING_NOW } from "@/lib/pay-from";
import { usePayFromDefault, usePayFromPreview, type PayFromPreview } from "@/lib/use-pay-from";
import { ENROL_ACTION_LABEL, TRANSFER_ACTION_LABEL, groupNameShown } from "@/lib/enrol-labels";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { availableStudents, poolSearchTerm, studentPoolQuery } from "@/lib/student-pool";
import { studentGroupId } from "@/lib/student-status";
import { openingOffered } from "@/lib/openings";
import { useOpeningsSummary } from "@/lib/openings-summary";
import { formAllowsConfirm } from "@/lib/money-preview";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { EnrolTransferRows } from "./enrol-transfer-rows";
import { BulkOutcomePanel, type BulkOutcomeRow } from "./bulk-outcome-panel";
import { EnrolTerms } from "./enrol-terms";
import { BarDetails, BarMoreButton } from "./enrol-bar-details";
import { EnrolExceptions, EnrolNoteRows, EnrolRefusedAllRow, EnrolRefusedRow, ExceptionRow, type EnrolNote } from "./enrol-exceptions";
import { bulkSources, inGroupsLabel, MANY_GROUPS_TRANSFER_HINT } from "@/lib/transfer-source";
import { bulkHeadline, bulkOutcomeOf, probeRefusalsOf, sameRefusalForAll } from "@/lib/bulk-outcome";
import { enrolBarOf, enrolButtonLabel, type EnrolBarRow } from "@/lib/enrol-bar";
import { dryRunOverride, isOwnPrice, ownPriceError, payStartsLine, priceInWords, type OwnPriceError } from "@/lib/enrol-terms";
import { groupScheduleLine, type ScheduleSlotLike } from "@/lib/group-schedule-line";
import { canManageMoney } from "@/lib/money-effects";
import { effectiveEnrolMode, secondGroupLine } from "@/lib/enrol-mode";
import { useAuthStore } from "@/lib/store";
import { PHONE_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/ui/chip";
import { PickedChips } from "@/components/ui/picked-chips";
import { SummaryBar } from "@/components/ui/summary-bar";
import { pluralRu } from "@/lib/plural";
import { pastBalancesByStudent } from "@/lib/past-balances";
import { leaveReturnsOfBulk, leaveUndoOf, type LeaveUndo } from "@/lib/transfer-effects";
import { workspaceBases, workspaceOfPath } from "@/lib/ia-links";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  class_level: number;
  status: string;
  /** Current (primary) group of the student; null when not enrolled. */
  group_id?: string | null;
  /** Active memberships in live groups (list API); older servers omit it. */
  groups_count?: number | null;
  /** The group the student is in now, from the memberships (students.group_id may be empty or stale). */
  current_group_id?: string | null;
}

/** Result handed to the page so it can show one summary toast. */
export interface AddStudentsResult {
  added: number;
  skipped: number;
  /** "Фамилия Имя — причина" for every student the server refused. */
  skippedLines: string[];
  /** Server hints that are not refusals (third group, class mismatch). */
  warnings: string[];
  /** Calm notes, e.g. "оплата перенесена в новую группу" (N13 P2.1). */
  infos: string[];
  /** The group they were put into and the names of those who got in: the message of success says «Трое зачислены в «…»». */
  groupName?: string;
  addedNames?: string[];
  /** The line about what is to be paid at once («К оплате 600 000 сум — на странице «Оплаты»»), only for a role that sees money. */
  payNowLine?: string | null;
}

/** After the action: the words of the server about the returned «как были» - one or two students by name, more - the count only. */
function returnedLines(returned: ReadonlyMap<string, LeaveUndo>, onlyOne: boolean, nameOf: (id: string) => string): string[] {
  const entries = Array.from(returned.entries());
  if (entries.length === 0) return [];
  if (entries.length > 2) {
    const n = entries.length;
    return [`${n} ${pluralRu(n, ["ученик", "ученика", "учеников"])} ${n % 10 === 1 && n % 100 !== 11 ? "возвращён" : "возвращены"} как были`];
  }
  return entries.map(([id, undo]) => (onlyOne ? undo.text : `${nameOf(id)}: ${undo.text}`));
}

interface AddStudentDrawerProps {
  open: boolean;
  groupId: string;
  groupClassLevel?: number | null;
  /** The name of the group for the title (the list of the groups gives it too, a moment later). */
  groupName?: string;
  /**
   * The price of this group today (`price_current` of the group): `null` - not set, `undefined` - the role does not
   * see money (the key is absent).  The students added here take it.
   */
  groupPrice?: GroupPriceBrief | null;
  /** Р4-1: the price of the group planned from a day while none is in force (`GET /org/group-prices`): «Цена с 25.11 — 400 000 сум», not «не задана». */
  groupScheduledPrice?: GroupPriceScheduled | null;
  /** Where the groups live («/owner/groups»): «Задать цену группы» leads to the page «Оплаты -> Цены групп» next to it. */
  groupsBasePath?: string;
  existingStudentIds: Set<string>;
  onClose: () => void;
  onAdded: (result: AddStudentsResult) => void;
}

/** On a phone a list of students shows this many rows before «и ещё N»; the rest opens on request (a search finds anybody).  A wide window scrolls the whole list inside. */
const LIST_PREVIEW = 5;

const nameOfStudent = (student: Student) => student.full_name || `${student.last_name} ${student.first_name}`.trim();

export function AddStudentDrawer({
  open, groupId, groupClassLevel, groupName, groupPrice, groupScheduledPrice, groupsBasePath, existingStudentIds, onClose, onAdded,
}: AddStudentDrawerProps) {
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  // Picked students are kept as objects: they stay selected (and keep their
  // «из другой группы» hint) when the list reloads under another class filter.
  const [selected, setSelected] = useState<Map<string, Student>>(new Map());
  const [adding, setAdding] = useState(false);
  // Money-2 Э4: a bulk entry with a refused student stays open as «Записано 3 из 4» + the reason of each refusal; «Готово» hands the result to the page
  const [outcome, setOutcome] = useState<{ rows: BulkOutcomeRow[]; headline: string; bar: ReturnType<typeof enrolBarOf>; result: AddStudentsResult } | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [groupSchedule, setGroupSchedule] = useState<ReadonlyArray<ScheduleSlotLike> | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // a refusal of the price / the day / the opening balance opens the conditions in place (the number only says «again»)
  const [termsSignal, setTermsSignal] = useState(0);
  // the refusal of the own price stands AT its field (the panel opens itself); an edit of the field takes it away
  const [priceError, setPriceError] = useState<OwnPriceError | null>(null);
  // a phone: the special rows stand right under the labels of the chosen, before the list of the rest (F6)
  const phone = useMediaQuery(PHONE_QUERY);
  // Students already in another group: move them here or keep both groups.
  const [chosenMode, setMode] = useState<GroupJoinMode>("transfer");
  // R3 M2: a transfer moves money - the money right only; without it the mode is «add» and the switch is not there
  const moneyRight = canManageMoney(useAuthStore((state) => state.user));
  const mode = effectiveEnrolMode(chosenMode, moneyRight);
  // Money is offered only to users the server lets see it (owner; administrator when allowed).
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const { summary: openingsSummary } = useOpeningsSummary(moneyAvailable);
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  // The center's mode names the price («Цена в месяц» / «Цена пакета»).
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  // An individual price is an exception: a sum that is not the price of the group, and then a reason (one for everybody added now).
  const [exceptionAmount, setExceptionAmount] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const groupAmount = groupPrice ? groupPrice.amount : null;
  const exceptionOn = isOwnPrice(exceptionAmount, groupAmount);
  // LOGIC-A decision 1: what the student had before ALGO («оплачено до» / «долг на дату»); one student at a time, never with a transfer.
  const [openingOn, setOpeningOn] = useState(false);
  const [opening, setOpening] = useState<OpeningFormValues>(emptyOpeningValues);
  const [openingNeedsReason, setOpeningNeedsReason] = useState(false);
  // Money-1 B1 «Оплата с»: the day the added student is charged from ("" until the server's default arrives)
  const [payFrom, setPayFrom] = useState("");
  // By default only the group's own class is offered; «Все классы» drops that filter.
  const [allClasses, setAllClasses] = useState(false);
  // the list shows a few rows; «и ещё N» opens all of them
  const [listOpen, setListOpen] = useState(false);
  // Latest-request-wins: a slow answer for the previous filter (fast «Все классы» toggle, typing)
  // must not replace the list of the current one.
  const [listSeq] = useState(() => createRequestSequence());
  // «По ученикам» of the bar
  const [byStudent, setByStudent] = useState(false);
  // the fields of the conditions are open: the list of students is folded up to the labels
  const [termsOpen, setTermsOpen] = useState(false);
  // a student is chosen far down the list: the labels (their list) come into view, the page does not leave the person looking at a row that has just moved away
  const chipsBox = useRef<HTMLDivElement | null>(null);
  const chosenBefore = useRef(0);

  useEffect(() => {
    if (!open) return;
    setMode("transfer");
    setOutcome(null);
    setExceptionAmount("");
    setExceptionReason("");
    setOpeningOn(false);
    setOpening(emptyOpeningValues());
    setOpeningNeedsReason(false);
    setAllClasses(false);
    setListOpen(false);
    setByStudent(false);
    setPayFrom("");
    setPriceError(null);
  }, [open]);

  // Names and schedules of the groups: for the title / the line under it and the «currently in ...» tags; a failure only drops them.
  useEffect(() => {
    if (!open) return;
    setAddError(null);
    let cancelled = false;
    orgApi.listGroups()
      .then((list) => {
        if (cancelled) return;
        const items = Array.isArray(list) ? list : (list as any)?.items || [];
        setGroupNames(Object.fromEntries(items.map((g: any) => [g.id, g.name])));
        setGroupSchedule(items.find((g: any) => g.id === groupId)?.schedule ?? null);
      })
      .catch(() => { if (!cancelled) { setGroupNames({}); setGroupSchedule(null); } });
    return () => { cancelled = true; };
  }, [open, groupId]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The drawer enrols NEW students: without a search (under two characters) only students with no
  // group are listed; a search of two or more characters looks through all non-archived ones.
  const searchTerm = poolSearchTerm(debouncedSearch);
  const searching = searchTerm !== "";
  // One typed character is too little to search: say so instead of silently showing the free students.
  const tooShort = !searching && debouncedSearch.trim() !== "";

  const loadStudents = useCallback(async () => {
    const token = listSeq.next();
    setLoading(true);
    try {
      const data = await orgApi.listStudentsPage(
        studentPoolQuery({ search: searchTerm, groupClassLevel, allClasses }),
      );
      if (!listSeq.isCurrent(token)) return;
      setStudents(data.items);
      setTotalFound(data.total);
    } catch {
      if (!listSeq.isCurrent(token)) return;
      setStudents([]);
      setTotalFound(0);
    } finally {
      if (listSeq.isCurrent(token)) setLoading(false);
    }
  }, [searchTerm, groupClassLevel, allClasses, listSeq]);

  useEffect(() => {
    if (open) loadStudents();
  }, [open, loadStudents]);

  useEffect(() => {
    if (selected.size > chosenBefore.current) chipsBox.current?.scrollIntoView({ block: "nearest" });
    chosenBefore.current = selected.size;
  }, [selected.size]);

  const toggle = (student: Student) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(student.id)) next.delete(student.id);
      else next.set(student.id, student);
      return next;
    });
  };

  // Students not already in the group; archived ones are never offered, and without a search
  // neither are students of other groups.  The chosen are the labels above, so the list holds the rest only.
  const available = availableStudents(students, existingStudentIds, { ungroupedOnly: !searching });
  const restRows = available.filter((student) => !selected.has(student.id));
  const everyone = [...Array.from(selected.values()), ...restRows];
  // a desktop list scrolls inside the window and holds every row; a phone has ONE scroll for the whole window, so there the list is folded to a few rows (CSS: `max-sm:hidden`)
  const hiddenRows = listOpen ? 0 : Math.max(0, restRows.length - LIST_PREVIEW);

  // Selected students who are enrolled elsewhere: adding moves them.
  const transfers = Array.from(selected.values())
    .filter((s) => { const current = studentGroupId(s); return current && current !== groupId; })
    .map((s) => ({
      id: s.id,
      name: nameOfStudent(s),
      from: groupNames[studentGroupId(s) as string] || "другой группы",
    }));

  // The price of this group, said to money roles only (the key is absent for the others).
  const priceNote = moneyAvailable ? targetGroupPriceHint(groupPrice, selected.size, groupScheduledPrice) : null;

  // The opening balance belongs to ONE student who comes new (a transfer closes memberships: the server refuses it then).
  const today = formatBusinessDate();
  // Money-2 fix 8: ONE bulk dry run of the chosen students (`mode=add`, or `mode=transfer` when somebody is moved) answers for every student: who comes back the day of the leaving (`students[].leave_undo`),
  // the balances of the last time (`students[].past_balances`) and what a chosen day charges at once.  The screen only shows the words of the server; «Оплата с» / price are not applied to a returning student by the server.
  const movedIds = new Set(mode === "transfer" ? transfers.map((t) => t.id) : []);
  const payFromBase = selected.size > 0 && (transfers.length === 0 || mode === "add");
  const { def: payDef } = usePayFromDefault(groupId, open && payFromBase);
  useEffect(() => { if (payDef) setPayFrom((current) => current || payDef.default_pay_from); }, [payDef]);
  const payRange = payFromRange(payDef?.today ?? today, accountingStart);
  // the default is there from the first frame the server answered (no flash of an empty date)
  const payFromValue = payFrom || payDef?.default_pay_from || "";
  const payBodyAsked = payFromBase ? payFromRequest(payFromValue, payDef, moneyAvailable) : null;
  const payProblemAsked = payFromBase && moneyAvailable ? payFromProblem(payFromValue, payDef, payRange) : null;

  // R3 #15: «что переедет» - the dry run of the same bulk transfer (`mode=transfer&dry_run=true`), asked when somebody from another group is chosen; «Зачислить» waits for it
  // an own price without its reason is asked with the stand-in reason of a dry run, so the sum follows the price on the screen; the real write never goes without it (F5)
  const dryException = moneyAvailable ? dryRunOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : { error: null, request: null };
  // UX pack №15: every chosen student is moved from another group (the mode «Перевести сюда») - the button says so, not «Зачислить»
  const movesOnly = transfers.length > 0 && transfers.length === selected.size && mode === "transfer" && moneyRight;
  const transferIds = Array.from(selected.keys()).sort();
  // Money-2 fix 3: the group each moved student leaves (one active group only; with two or more the server asks)
  const transferSources = bulkSources(Array.from(selected.values()).filter((s) => transfers.some((t) => t.id === s.id)), groupId);
  const transferKey = open && transfers.length > 0 && mode === "transfer" && !dryException.error
    ? `${groupId}|${transferIds.join(",")}|${JSON.stringify(dryException.request)}|${JSON.stringify(transferSources)}`
    : null;
  const transferPreview = useFormMoneyPreview(transferKey, (signal) => orgApi.dryRunBulkTransfer(groupId, transferIds, { price_override: dryException.request, sources: transferSources }, signal));
  const transferAllowed = formAllowsConfirm(transferKey, transferPreview.preview);
  // Money-1 B1: the same ask in `mode=add` (nobody is moved) also tells what a day in the past charges at once
  const addProbeKey = open && selected.size > 0 && movedIds.size === 0 && !dryException.error && !payProblemAsked
    ? `${groupId}|${transferIds.join(",")}|${payBodyAsked ?? ""}|${JSON.stringify(dryException.request)}` : null;
  const addProbe = usePayFromPreview(addProbeKey, (signal) => orgApi.dryRunBulkAdd(groupId, transferIds, { pay_from: payBodyAsked, price_override: dryException.request }, signal));
  const freshAnswer: unknown = transferKey !== null ? (transferPreview.preview.status === "ready" ? transferPreview.preview.answer : null) : (addProbe.status === "ready" ? addProbe.answer : null);
  // Money-2 fix 9: who comes back the day of the leaving and the balances of the last time depend on the group and the chosen students ONLY - not on the price, the reason or the day.  The key of the probe changes
  // with every press and is null while the form of the price / the day is half filled, so the answer of the CURRENT key is often not there; the last answer of THIS set stays meanwhile.  Another set: nothing old.
  const setKey = `${groupId}|${transferIds.join(",")}`;
  const [held, setHeld] = useState<{ set: string; answer: unknown } | null>(null);
  useEffect(() => { if (!open) setHeld(null); }, [open]);
  useEffect(() => { if (freshAnswer) setHeld({ set: setKey, answer: freshAnswer }); }, [freshAnswer, setKey]);
  const probeAnswer: unknown = freshAnswer ?? (held !== null && held.set === setKey ? held.answer : null);
  const { undone: undoneBy, ordinary: ordinaryBy } = leaveReturnsOfBulk(probeAnswer);
  const allUndone = selected.size > 0 && Array.from(selected.keys()).every((id) => undoneBy.has(id));
  const openingAllowed = openingOffered(moneyAvailable, openingsSummary) && selected.size === 1 && (transfers.length === 0 || mode === "add") && !allUndone;
  // Money-1 B1: «Оплата с» belongs to ADDING a student; a transfer has its own day (the server refuses the field there); not for those who all come back
  const payFromAllowed = payFromBase && !allUndone;
  const payBody = payFromAllowed ? payBodyAsked : null;
  const payProblem = payFromAllowed ? payProblemAsked : null;
  // F2: somebody is MOVED and somebody comes NEW («Перевести сюда»): the probe of the transfer is the one that answers, and it says what the new ones pay at once (`students[].billing.immediate`); the moved ones add nothing
  // to the sum (their money is told in their rows).  A failure of that probe is told in the transfer row with its own «Повторить», not twice.
  const mixedMove = moneyAvailable && transferKey !== null && transfers.length < selected.size;
  const tp = transferPreview.preview;
  const movePay: PayFromPreview & { retry: () => void } | null = !mixedMove ? null
    : tp.status === "ready" ? { status: "ready", immediate: normalizeBulkImmediate(tp.answer), answer: tp.answer, retry: transferPreview.retry }
    : tp.status === "loading" ? { status: "loading", retry: transferPreview.retry } : { status: "idle", retry: transferPreview.retry };
  const payPreview = movePay ?? (moneyAvailable ? addProbe : { status: "idle" as const, retry: addProbe.retry });
  // the link «Выписка» of the balances leads to a page that needs the right to money - the same flag that decides whether the sums are shown
  const pastBase = groupsBasePath && moneyAvailable ? workspaceBases(workspaceOfPath(groupsBasePath)).payments : null;
  const nameById = new Map(Array.from(selected.values()).map((s) => [s.id, nameOfStudent(s)]));

  // the sum at once: the answer of the probe; while the next one is coming, the previous one of the SAME set stays, faded
  const sharedTermsEntered = !allUndone && (dryException.request !== null || payBody !== null);
  const immediateReady = payPreview.status === "ready" ? payPreview : null;
  const [lastImmediate, setLastImmediate] = useState<{ set: string; preview: NonNullable<typeof immediateReady> } | null>(null);
  // the answer of the probe is the dependency (its object is stable); the status object is new on every render
  const readyAnswer = immediateReady?.answer;
  useEffect(() => { if (immediateReady) setLastImmediate({ set: setKey, preview: immediateReady }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyAnswer, setKey]);
  useEffect(() => { if (!open) setLastImmediate(null); }, [open]);
  const sumsOn = moneyAvailable && ((payFromAllowed && Boolean(payDef)) || mixedMove);
  const counting = sumsOn && payPreview.status === "loading";
  // a half-filled form (an own price without its reason, a day that is not a date) asks nothing: the previous sum of the SAME students stays, faded, and the line under it says what is missing - the bar does not jump
  const incomplete = sumsOn && (dryException.error !== null || payProblem !== null);
  const shownImmediate = !sumsOn ? null : immediateReady ?? ((counting || incomplete) && lastImmediate?.set === setKey ? lastImmediate.preview : null);
  const amountsState: "off" | "ready" | "stale" = !shownImmediate ? "off" : immediateReady ? "ready" : "stale";
  const immediateOf = new Map((shownImmediate?.immediate.rows ?? []).map((row) => [row.studentId, row]));
  const pastOf = new Map(pastBalancesByStudent(probeAnswer).map((entry) => [entry.studentId, entry.rows]));
  const barRows: EnrolBarRow[] = Array.from(selected.values()).map((student) => {
    const row = immediateOf.get(student.id) ?? (selected.size === 1 ? shownImmediate?.immediate.rows[0] : undefined);
    return { id: student.id, name: nameById.get(student.id) ?? "Ученик", amount: row?.amount ?? null, parts: row?.parts ?? [] };
  });
  const bar = amountsState === "off" ? null : enrolBarOf(barRows);
  const notes: EnrolNote[] = Array.from(selected.values()).map((student) => ({
    id: student.id,
    name: selected.size === 1 ? null : nameOfStudent(student),
    past: pastOf.get(student.id) ?? [],
    rewrite: ordinaryBy.get(student.id) ?? null,
    undone: undoneBy.get(student.id) ?? null,
    sharedUndone: sharedTermsEntered,
  }));

  // F3: the students the server will NOT write (the probe says so before the button); the button counts those who go through
  const refusals = probeRefusalsOf(probeAnswer).filter((row) => selected.has(row.id));
  const refusedIds = new Set(refusals.map((row) => row.id));
  const refusedForAll = sameRefusalForAll(refusals, selected.size);
  const passing = selected.size - refusedIds.size;

  const handleAdd = async () => {
    if (selected.size === 0 || !transferAllowed || passing === 0) return;
    // an own price without its reason: the error stands at that field (the conditions open by themselves), nothing is sent
    const priceProblem = moneyAvailable && !allUndone ? ownPriceError({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : null;
    if (priceProblem) { setPriceError(priceProblem); setTermsSignal((n) => n + 1); return; }
    const exception = moneyAvailable && !allUndone
      ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason })
      : { error: null, request: null };
    if (exception.error) { setAddError(exception.error); setTermsSignal((n) => n + 1); return; }
    if (payProblem) { setAddError(payProblem); setTermsSignal((n) => n + 1); return; }
    const withOpening = openingAllowed && openingOn;
    if (withOpening) {
      const problem = validateOpening(opening, { enrolDate: today, accountingStart, today });
      if (problem) { setAddError(problem); setTermsSignal((n) => n + 1); return; }
      const reasonProblem = openingNeedsReason ? validateOpeningReason(opening.reason) : null;
      if (reasonProblem) { setAddError(reasonProblem); setTermsSignal((n) => n + 1); return; }
    }
    setAdding(true);
    setAddError(null);
    try {
      const picked = Array.from(selected.values());
      const nameOf = (id: string) => {
        const s = picked.find((item) => item.id === id);
        return s ? nameOfStudent(s) : "Ученик";
      };
      const openingBody = withOpening ? buildOpeningIn(opening) : null;
      // One student with an opening balance - or with a chosen «Оплата с» - goes through the route that answers `billing` (the server's sentence).  Otherwise ONE bulk request for everybody:
      // the server itself applies «Оплата с» / the price to the ones it applies to and leaves a returning student as he was (fix 8, M2).
      const singleRoute = Boolean(openingBody) || (payBody !== null && picked.length === 1);
      let billingLine: string | null = null;
      // the words of the server about those who came back as they were: from the answer of the WRITE (one student: `leave_undo`; a batch: `students[].leave_undo`)
      let returned: Map<string, LeaveUndo> = new Map();
      const result = singleRoute
        ? await orgApi.addStudentToGroup(groupId, picked[0].id, {
          mode: transfers.length > 0 ? mode : undefined,
          price_override: exception.request,
          opening_balance: openingBody,
          pay_from: payBody,
        }).then((single) => {
          billingLine = payBody ? normalizeBilling(single.billing)?.text || null : null;
          const undo = leaveUndoOf(single);
          if (undo?.undone) returned = new Map([[picked[0].id, undo]]);
          return {
            added: single.status === "added" ? 1 : 0,
            skipped: single.status === "added" ? 0 : 1,
            skipped_details: single.status === "added" ? [] : [{ student_id: picked[0].id, reason: "уже в этой группе" }],
            warnings: single.warnings,
            results: undefined,
          };
        })
        : await orgApi.bulkAddStudents(groupId, picked.map((item) => item.id), {
          // The mode only matters for students who are already in another group.
          mode: transfers.length > 0 ? mode : undefined,
          price_override: exception.request,
          pay_from: payBody,
          sources: mode === "transfer" ? transferSources : undefined,
        });
      setSelected(new Map());
      if (!singleRoute) returned = leaveReturnsOfBulk(result).undone;
      const notes = splitTransferNotes(result.warnings, nameOf);
      if (payBody && !billingLine && result.added > 0) billingLine = `Оплата считается с ${formatDateRu(payBody)}: так выбрал сотрудник`;
      const perStudent = bulkOutcomeOf(result, picked.map((item) => item.id), nameOf);
      const skippedIds = new Set(perStudent.skipped.map((row) => row.id));
      // what the ones who got in pay at once: the sums of the probe, none for a role without money / a transfer
      const paidRows = barRows.filter((row) => !skippedIds.has(row.id));
      const paid = bar ? enrolBarOf(paidRows) : null;
      const summary: AddStudentsResult = {
        added: result.added,
        skipped: result.skipped,
        skippedLines: (result.skipped_details || []).map((d) => `${nameOf(d.student_id)} — ${d.reason}`),
        warnings: notes.warnings,
        infos: [...returnedLines(returned, picked.length === 1, nameOf), ...notes.infos, ...(billingLine ? [billingLine] : [])],
        groupName: groupName ?? groupNames[groupId],
        addedNames: perStudent.addedNames,
        payNowLine: paid && paid.total ? `К оплате ${formatMoney(paid.total)} — на странице «Оплаты»` : null,
      };
      // somebody was refused: the window stays and says it per student (the toast then carries the numbers only); nobody refused: as before
      if (perStudent.skipped.length > 0) {
        const rows: BulkOutcomeRow[] = picked.map((item) => {
          const refused = perStudent.skipped.find((row) => row.id === item.id);
          return { id: item.id, name: nameOf(item.id), ok: !refused, reason: refused?.reason ?? null, code: refused?.code ?? null };
        });
        setOutcome({ rows, headline: bulkHeadline(perStudent, movesOnly ? "transfer" : "enrol"), bar: paid ?? enrolBarOf([]), result: { ...summary, skippedLines: [], payNowLine: null } });
      } else onAdded(summary);
    } catch (e: any) {
      const failure = logicaError(e, "Ошибка добавления учеников");
      if (isReasonRequired(failure) && openingOn) setOpeningNeedsReason(true);
      const fieldError = payFromErrorText(failure) ?? (isReasonRequired(failure) && openingOn ? `${failure.message}. Укажите причину ниже.` : null);
      if (fieldError) setTermsSignal((n) => n + 1);
      setAddError(fieldError ?? failure.message);
    } finally {
      setAdding(false);
    }
  };

  // The class filter is on: the group has a class and «Все классы» is off.
  const classFilterOn = Boolean(groupClassLevel) && !allClasses;
  const nameOfGroup = groupName ?? groupNames[groupId] ?? "";

  // under the title: the schedule and, for the money roles, the price - what the choice of the students is made by
  const priceWords = !moneyAvailable || groupPrice === undefined
    ? null
    : groupPrice === null ? priceNotInForceText(groupScheduledPrice, "цена не задана") : priceInWords(groupPrice.amount, priceLabel);
  const scheduleText = groupScheduleLine(groupSchedule);
  const description = (
    <span data-testid="enrol-group-line">{[scheduleText.charAt(0).toLocaleUpperCase("ru") + scheduleText.slice(1), priceWords].filter(Boolean).join(" · ")}</span>
  );

  // the special rows exist only when there is something to say (no empty block)
  const exceptionsShown = selected.size > 0 && (
    (moneyAvailable && groupPrice === null && Boolean(priceNote)) || transfers.length > 0 || transferKey !== null
    || notes.some((note) => note.past.length > 0 || note.rewrite !== null || note.undone !== null) || refusals.length > 0
  );

  // the bar: the sum, the line under it, the button
  const noPrice = moneyAvailable && groupPrice === null;
  const failed = sumsOn && payPreview.status === "failed";
  const firstCount = counting && amountsState === "off";
  const calculating = counting;
  const stale = amountsState === "stale";
  // F10: nobody pays at once because the day of the charge is ahead: the muted line says when it starts (the day is the server's `pay_from`)
  const payStart = shownImmediate ? payStartOf(shownImmediate.answer) : null;
  const idle = selected.size === 0
    ? "Выберите учеников"
    : noPrice ? "Сумма появится, когда у группы будет цена"
    : failed ? "Не удалось посчитать, сколько начислится сразу"
    : firstCount ? "Считаем…"
    : bar && bar.total === null && amountsState === "ready" && payFromIsPast(payFromValue, payDef) ? PAY_FROM_NOTHING_NOW
    : bar && bar.total === null && amountsState === "ready" && refusals.length === 0 && payStart && payStart > (payDef?.today ?? today) ? <span className="whitespace-nowrap">{payStartsLine(payStart, payDef?.today ?? today)}</span>
    : null;
  const whyOff = !transferAllowed ? "Кнопка включится, когда будет посчитано, что изменится" : payProblem;
  const line = stale ? (incomplete ? (payProblem ? <span data-testid="enrol-why">{payProblem}</span> : null) : "считаем…") : failed
    ? <button type="button" onClick={payPreview.retry} data-testid="pay-from-retry" className="font-semibold text-primary-700 underline">Повторить</button>
    : whyOff ? <span id="enrol-why" data-testid="enrol-why">{whyOff}</span>
    : bar && bar.total !== null && (bar.line || bar.expandable) ? (
      <>
        {bar.line}
        {bar.expandable && <>{" "}<BarMoreButton rows={barRows} open={byStudent} onToggle={() => setByStudent((value) => !value)} /></>}
      </>
    ) : null;
  const buttonText = adding ? (movesOnly ? "Перевод…" : "Зачисление…") : enrolButtonLabel(passing, movesOnly ? "transfer" : "enrol");
  const submitOff = selected.size === 0 || passing === 0 || adding || !transferAllowed || payProblem !== null || calculating;

  const title = outcome ? outcome.headline : nameOfGroup ? `${movesOnly ? "Перевести" : "Зачислить"} в «${groupNameShown(nameOfGroup)}»` : movesOnly ? TRANSFER_ACTION_LABEL : ENROL_ACTION_LABEL;
  const removeLabel = (label: string) => `Убрать: ${label}`;

  // the special rows: only when there is something to say (no empty block); the same block stands under the labels on a phone and under the list on a wide window
  const exceptionsBlock = exceptionsShown && (
    <EnrolExceptions>
          {refusedForAll !== null ? <EnrolRefusedAllRow reason={refusedForAll} /> : refusals.map((row) => <EnrolRefusedRow key={row.id} id={row.id} name={nameById.get(row.id) ?? "Ученик"} reason={row.reason} />)}
          {moneyAvailable && groupPrice === null && priceNote && (
            <ExceptionRow
              tone="warn"
              testId="enrol-note-price"
              aside={<a href={groupPriceHref(groupsBasePath ?? "", groupId)} onClick={onClose} className="inline-flex min-h-8 items-center text-sm font-semibold text-primary-700 hover:underline max-sm:min-h-10">{groupScheduledPrice ? "Цена группы" : "Задать цену"}</a>}
            >
              {priceNote}
            </ExceptionRow>
          )}
          {transfers.length > 0 && !moneyRight && transfers.map((t) => (
            <ExceptionRow key={t.id} tone="muted" testId="enrol-second-group">{secondGroupLine(t)}</ExceptionRow>
          ))}
          {transfers.length > 0 && moneyRight && (
            <EnrolTransferRows
              students={transfers.map((t) => ({ ...t, hint: inGroupsLabel(selected.get(t.id)?.groups_count) ? MANY_GROUPS_TRANSFER_HINT : null }))}
              mode={mode}
              onMode={setMode}
              preview={transferKey !== null ? transferPreview.preview : { status: "idle" }}
              onRetry={transferPreview.retry}
            />
          )}
          {notes.map((note) => <EnrolNoteRows key={note.id} note={note} paymentsBase={pastBase} />)}
    </EnrolExceptions>
  );

  return (
    <Modal
      open={open}
      placement="right"
      title={title}
      description={outcome ? (nameOfGroup ? `«${groupNameShown(nameOfGroup)}» · ${scheduleText}` : undefined) : description}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain"
      footerClassName="flex flex-col"
      footer={outcome ? (
        <SummaryBar
          label="К оплате"
          amount={outcome.bar.total !== null ? outcome.bar.totalText : null}
          unit={outcome.bar.unit}
          line={outcome.bar.line}
          action={<Button type="button" size="lg" onClick={() => onAdded(outcome.result)} data-testid="enrol-done">Готово</Button>}
        />
      ) : (
        <>
          {addError && (
            <p role="alert" data-testid="enrol-error" className="mx-5 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 max-sm:mx-4">{addError}</p>
          )}
          {/* «По ученикам»: the list opens here, over the bar, in view on every width (a part of the pinned block, at most 40% of the screen, its own scroll) */}
          {bar?.expandable && byStudent && <BarDetails rows={barRows} />}
          <SummaryBar
            label="К оплате сразу"
            amount={bar && bar.total !== null ? bar.totalText : null}
            unit={bar?.unit}
            dim={stale}
            idle={idle}
            line={line}
            action={<Button type="button" size="lg" onClick={() => void handleAdd()} disabled={submitOff} loading={adding} data-testid="enrol-submit" aria-describedby={selected.size > 0 && whyOff ? "enrol-why" : undefined}>{buttonText}</Button>}
          />
        </>
      )}
    >
      {outcome ? <BulkOutcomePanel rows={outcome.rows} /> : (<>
      {/* Who: the search and the chosen as labels */}
      <div className="flex flex-col px-5 pt-1 max-sm:px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или ID…"
            aria-label="Поиск по имени или ID"
            autoFocus
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {selected.size > 0 && (
          <div className="mt-3" ref={chipsBox}>
            <PickedChips
              items={Array.from(selected.values()).map((student) => ({ id: student.id, label: nameOfStudent(student) }))}
              onRemove={(id) => setSelected((prev) => { const next = new Map(prev); next.delete(id); return next; })}
              removeLabel={removeLabel}
            />
          </div>
        )}
      </div>
      {/* a phone: what the server says about the chosen stands right under their labels, so it is seen without scrolling (a wide window keeps it under the list) */}
      {phone && exceptionsBlock}
      {/* the rest as a short list */}
      <div className={`flex flex-col px-5 pb-2 max-sm:px-4 sm:min-h-0 sm:flex-1 ${termsOpen && selected.size > 0 ? "max-sm:hidden" : ""}`}>
        <div className="mt-3 flex shrink-0 items-baseline gap-1.5 text-xs text-slate-600" data-testid="enrol-others-title">
          <span>{selected.size > 0 ? "Ещё ученики" : classFilterOn ? `Ученики ${groupClassLevel} класса` : "Ученики"}</span>
          {groupClassLevel ? (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                role="switch"
                aria-checked={allClasses}
                onClick={() => setAllClasses((value) => !value)}
                data-testid="enrol-all-classes"
                className={`inline-flex min-h-8 items-center rounded-md font-semibold transition-colors max-sm:min-h-10 ${allClasses ? "text-primary-800 underline" : "text-primary-700 hover:underline"}`}
              >
                все классы
              </button>
            </>
          ) : null}
        </div>
        <div data-testid="enrol-list" className="sm:min-h-24 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain">
          {tooShort && <p className="pt-2 text-xs text-slate-600">Введите минимум 2 символа</p>}
          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
            </div>
          ) : restRows.length === 0 && selected.size === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-600">
              {searching
                ? `Ничего не найдено${classFilterOn ? ". Попробуйте «Все классы»" : ""}`
                : "Нет учеников без группы. Найдите ученика по имени или ID, чтобы перевести или добавить его в эту группу."}
            </p>
          ) : restRows.length === 0 ? (
            <p data-testid="enrol-list-rest-empty" className="pt-3 text-xs text-slate-600">{searching ? "Других учеников по этому поиску нет" : "Других учеников без группы нет"}</p>
          ) : (
            <ul role="group" aria-label="Ученики" data-testid="enrol-rows">
              {restRows.map((s, index) => {
                const current = studentGroupId(s);
                const elsewhere = current && current !== groupId;
                const status = inGroupsLabel(s.groups_count) || (elsewhere ? `в «${groupNames[current as string] || "другой группе"}»` : "без группы");
                const detail = namesakeDetail(s, everyone);
                return (
                  <li key={s.id} className={`border-t border-slate-100 first:border-t-0 ${!listOpen && index >= LIST_PREVIEW ? "max-sm:hidden" : ""}`}>
                    <label data-student-row={s.id} className="flex cursor-pointer items-center gap-3 py-2.5">
                      <Checkbox checked={false} onChange={() => toggle(s)} aria-label={nameOfStudent(s)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900 [overflow-wrap:anywhere]">{nameOfStudent(s)}</span>
                        <span className="block text-xs text-slate-600 [overflow-wrap:anywhere]">
                          {classLabel(s.class_level)}
                          {detail && <span data-testid="namesake-detail"> · {detail}</span>}
                        </span>
                      </span>
                      <Tag testId={inGroupsLabel(s.groups_count) ? "student-many-groups" : undefined} className="max-w-[45%] shrink-0 truncate">{status}</Tag>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && hiddenRows > 0 && (
            <button type="button" onClick={() => setListOpen(true)} data-testid="enrol-list-more" className="inline-flex sm:hidden min-h-8 items-center text-sm text-slate-600 hover:text-slate-900 hover:underline max-sm:min-h-10">
              и ещё {hiddenRows} {pluralRu(hiddenRows, ["ученик", "ученика", "учеников"])}
            </button>
          )}
          {!loading && totalFound > students.length && (
            <p className="py-2 text-xs text-slate-600">
              Показаны первые {students.length} из {totalFound}. Уточните поиск, чтобы найти остальных.
            </p>
          )}
        </div>
      </div>
      {!phone && exceptionsBlock}
      {/* Conditions: one line, the rare fields open in place; a role without money has none */}
      {moneyAvailable && !allUndone && selected.size > 0 && (
        <EnrolTerms
          idPrefix="add-student"
          payDef={payFromAllowed ? payDef : null}
          showPayFrom={payFromAllowed}
          payFrom={payFromValue}
          onPayFrom={(next) => { setAddError(null); setPayFrom(next); }}
          accountingStart={accountingStart}
          priceLabel={priceLabel}
          groupAmount={groupAmount}
          amount={exceptionAmount}
          reason={exceptionReason}
          onAmount={(text) => { setAddError(null); setPriceError(null); setExceptionAmount(text); }}
          onReason={(text) => { setAddError(null); setPriceError(null); setExceptionReason(text); }}
          priceError={priceError}
          openSignal={termsSignal}
          onOpenChange={setTermsOpen}
          opening={openingAllowed ? { on: openingOn, onChange: (value) => { setAddError(null); setOpeningOn(value); }, values: opening, onValues: (next) => { setAddError(null); setOpening(next); }, today, accountingStart, needsReason: openingNeedsReason } : null}
        />
      )}

      </>)}
    </Modal>
  );
}
