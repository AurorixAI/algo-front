"use client";

import { isStaleRefusal, REFRESH_LABEL } from "@/lib/money-preview";
import { Select } from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import {
  X,
  Search,
  Users,
  Loader2,
  Check,
  GraduationCap,
  RotateCcw,
} from "lucide-react";
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
import { formAllowsConfirm } from "@/lib/money-preview";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { TransferPreviewBlock } from "./transfer-preview-block";
import { GroupPickCard } from "./group-pick-card";
import type { ScheduleSlotLike } from "@/lib/group-schedule-line";
import { Notice } from "@/components/ui/notice";
import { LeaveUndoNote } from "@/components/money/effects-sections";
import { assignDoneToast, type EnrolToast } from "@/lib/group-enrol";
import { PastBalancesNote } from "@/components/money/past-balances-note";
import { workspaceBases, workspaceOfPath } from "@/lib/ia-links";
import { BALANCE_CHANGED_TEXT, expectedCarriedOf, isBalanceChanged, leaveUndoOf } from "@/lib/transfer-effects";
import { SOURCE_LABEL, SOURCE_PLACEHOLDER, SOURCE_WHY, sourcesFromError, transferSource, type SourceGroup } from "@/lib/transfer-source";
import { splitTransferNotes } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { staffDisplayName } from "@/lib/staff-name";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { EnrolPriceToggle } from "@/components/payments/price-fields";
import { OpeningToggle } from "@/components/payments/opening-balance-fields";
import { openingOffered } from "@/lib/openings";
import { useOpeningsSummary } from "@/lib/openings-summary";
import { buildOpeningIn, emptyOpeningValues, isReasonRequired, logicaError, validateOpening, validateOpeningReason, type OpeningFormValues } from "@/lib/payments-logica";
import { formatBusinessDate } from "@/lib/business-time";
import { normalizeBilling, payFromErrorText, payFromProblem, payFromRange, payFromRequest } from "@/lib/pay-from";
import { usePayFromDefault, usePayFromPreview } from "@/lib/use-pay-from";
import { PayFromField } from "./pay-from-field";
import { enrolDialogTitle, enrolSubmitLabel } from "@/lib/enrol-labels";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, ConfirmFooter, MONEY_WINDOW_FORM } from "@/components/money/dialog-footer";
import { Button } from "@/components/ui/button";

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

interface TeacherInfo {
  id: string;
  first_name: string;
  last_name: string;
  org_role?: string;
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
  const [teachers, setTeachers] = useState<TeacherInfo[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  // Money-2 fix 3: 409 `TRANSFER_SOURCE_GONE` - the words of the server once and one action, «Обновить»
  const [assignmentStale, setAssignmentStale] = useState(false);
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const scheduledPrices = useScheduledGroupPrices(open && moneyAvailable && groups.some((g) => g.price_current === null));      // G3M Ф6: a price planned from a day is not «не задана»
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  // An individual price is an exception: off by default, a sum and a reason when on.
  const [exceptionOn, setExceptionOn] = useState(false);
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
  const sources = serverSources ?? sourceGroups ?? (currentGroupId ? [{ id: currentGroupId, name: currentGroupName ?? "" }] : []);
  const source = isTransfer ? transferSource(sources, fromGroupId) : { needed: false, id: null };
  // Money-1 B1 «Оплата с»: the day the student is charged from in the chosen group ("" until the default of that group arrives); a transfer has no such field
  const [payFrom, setPayFrom] = useState("");

  // Load groups & teachers when opened
  useEffect(() => {
    if (open) {
      let cancelled = false;
      setLoading(true);
      setSelectedGroupId(null);
      setAssignmentError(null);
      setLoadError(null);
      setSearch("");
      setSelectedTeacherId("");
      setExceptionOn(false);
      setExceptionAmount("");
      setExceptionReason("");
      setOpeningOn(false);
      setOpening(emptyOpeningValues());
      setOpeningNeedsReason(false);
      setPayFrom("");
      setFromGroupId("");
      setServerSources(null);

      Promise.all([
        orgApi.listGroups(),
        orgApi.listMembers(),
      ])
        .then(([groupsData, membersData]) => {
          if (cancelled) return;
          const rawGroups: GroupInfo[] = Array.isArray(groupsData)
            ? groupsData
            : (groupsData as any)?.items || [];
          setGroups(rawGroups.filter((g) => g.status !== "archived"));

          const rawMembers: any[] = Array.isArray(membersData) ? membersData : [];
          const teacherList: TeacherInfo[] = rawMembers
            .filter((m) => m.org_role === "teacher")
            .map((m) => ({
              id: m.id || m.user_id,
              first_name: m.first_name || "",
              last_name: m.last_name || "",
              org_role: m.org_role,
            }));
          setTeachers(teacherList);
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

  // The current group remains visible in its own context card.  It is never a
  // valid destination for a transfer and therefore does not appear among
  // selectable target groups.
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (excluded.has(g.id)) {
        return false;
      }
      if (selectedTeacherId && g.teacher_id !== selectedTeacherId) {
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
  }, [groups, excluded, selectedTeacherId, search]);

  const handleAssign = async () => {
    if (!selectedGroupId || assigning || !transferAllowed || (source.needed && !source.id)) return;
    if (excluded.has(selectedGroupId)) {
      setAssignmentError("Ученик уже состоит в выбранной группе. Выберите другую группу.");
      return;
    }
    const exception = moneyAvailable && leaveUndo?.undone !== true
      ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason })
      : { error: null, request: null };
    if (exception.error) { setAssignmentError(exception.error); return; }
    if (payProblem) { setAssignmentError(payProblem); return; }
    const todayDate = formatBusinessDate();
    const withOpening = openingShown && !isTransfer && openingOn && leaveUndo?.undone !== true;
    if (withOpening) {
      const problem = validateOpening(opening, { enrolDate: todayDate, accountingStart, today: todayDate });
      if (problem) { setAssignmentError(problem); return; }
      const reasonProblem = openingNeedsReason ? validateOpeningReason(opening.reason) : null;
      if (reasonProblem) { setAssignmentError(reasonProblem); return; }
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
      setAssignmentError(payFromErrorText(failure) || (isReasonRequired(failure) && openingOn ? `${failure.message}. Укажите причину ниже.` : failure.message) || (isAdd ? "Не удалось зачислить ученика в группу" : isTransfer ? "Не удалось перевести ученика в группу" : "Не удалось зачислить ученика в группу"));
    } finally {
      setAssigning(false);
    }
  };

  // R3 #15: «что переедет» - the dry run of the same transfer, asked when the group is chosen; «Перевести» waits for it (a first enrolment carries nothing: no ask)
  const dryException = moneyAvailable ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : { error: null, request: null };
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

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) ?? null, [groups, selectedGroupId]);
  const selectedPriceNote = selectedGroup ? targetGroupPriceHint(selectedGroup.price_current, 1, scheduledPrices[selectedGroup.id]) : null;

  const formTitle = enrolDialogTitle(isAdd ? "add" : "transfer", isTransfer);

  return (
    <Modal
      open={open}
      title={formTitle}
      description={(
        // re-audit В2: who and from where on ONE line under the title (the card «Текущая группа» that scrolled out of sight is gone)
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5" data-testid="assign-current-group">
          <span className="font-semibold text-slate-800">{studentName}</span>{" "}
          {studentGrade && (
            <span className="rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">{studentGrade} класс</span>
          )}
          {((isTransfer && !source.needed) || (isAdd && currentGroupLabel)) && (
            // the caption stands on its own line - never a separator dot at the start of a wrapped line
            <span className="basis-full text-slate-600" data-testid="assign-current-caption">
              {isAdd ? "уже занимается в" : "сейчас в"} «<span className="[overflow-wrap:anywhere]">{currentGroupLabel || "…"}</span>»
            </span>
          )}
        </span>
      )}
      onClose={onClose}
      busy={assigning}
      size="md"
      bodyClassName="px-5 sm:px-6 pt-2 pb-4 overflow-y-auto overscroll-contain min-h-0"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={(
        // re-audit В1: the footer of every window of money; «почему» stands over the off button
        <ConfirmFooter
          primary={assigning ? (isTransfer ? "Переводим…" : "Зачисляем…") : enrolSubmitLabel(isAdd ? "add" : "transfer", isTransfer)}
          onPrimary={() => void handleAssign()}
          busy={assigning}
          disabled={!selectedGroupId || excluded.has(selectedGroupId) || assigning || !transferAllowed || payProblem !== null || (source.needed && !source.id)}
          why={source.needed && !source.id ? SOURCE_WHY : !selectedGroupId ? "Выберите группу" : !transferAllowed ? "Кнопка включится, когда будет посчитано, что изменится" : null}
          whyId="assign-why"
          onCancel={onClose}
          testId="assign-submit"
        />
      )}
    >
        <>
    {/* The current membership is context, not a destination: it stands in the line under the title.  Several current groups: one amber line. */}
    <div className="space-y-2.5 pb-3">
      {source.needed && (
        <div data-testid="assign-source">
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
      <div className="grid gap-2.5 sm:grid-cols-2">
        {/* Teacher Selector */}
        <div>
          <label htmlFor="assign-group-prepodavatel" className="mb-1 block text-xs font-semibold text-slate-600">
            Преподаватель
          </label>
          <Select
            id="assign-group-prepodavatel"
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
            options={[{ value: "", label: "Все преподаватели" }, ...teachers.map((t) => ({ value: t.id, label: staffDisplayName(t) }))]}
            buttonClassName="bg-white py-2.5 pl-3.5"
          />
        </div>

        {/* Search Bar */}
        <div>
          <label htmlFor="assign-group-search" className="mb-1 block text-xs font-semibold text-slate-600">Группа</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="assign-group-search"
              type="text"
              placeholder="Поиск группы"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Очистить поиск"
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* The list is as tall as its content (at most 40 % of the screen, then it scrolls): no empty space between the groups and the money under them (re-audit В2) */}
    <div className="max-h-[40vh] overflow-y-auto rounded-2xl bg-slate-50/60 p-2.5 flex-shrink-0 sm:max-h-[300px]" data-testid="assign-groups">
      {loading ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
          <p className="text-xs font-medium text-slate-500">Загрузка доступных групп...</p>
        </div>
      ) : loadError ? (
        <div className="flex min-h-[120px] items-center justify-center px-3">
          <DataLoadError
            compact
            title="Не удалось загрузить группы"
            message={loadError}
            onRetry={() => setReloadNonce((current) => current + 1)}
          />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center px-4 py-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-500 mb-3">
            <GraduationCap className="w-7 h-7 text-slate-300" />
          </div>
          <h4 className="text-sm font-bold text-slate-800 mb-1">
            {search || selectedTeacherId ? "Группы не найдены" : isTransfer ? "Нет группы для перевода" : isAdd ? "Нет других групп" : "Нет активных групп"}
          </h4>
          <p className="text-xs text-slate-500 max-w-xs mb-4">
            {search || selectedTeacherId
              ? "Попробуйте изменить параметры поиска или выбрать другого преподавателя."
              : isTransfer
                ? "Ученик уже состоит в единственной доступной активной группе."
                : "В организации пока не создано ни одной учебной группы."}
          </p>
          {(search || selectedTeacherId) && (
            <Button
              onClick={() => {
                setSearch("");
                setSelectedTeacherId("");
              }}
              variant="secondary" size="sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Сбросить фильтры
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-1 text-xs font-semibold text-slate-600">
            <span>{isTransfer ? "Группы для перевода" : isAdd ? "Группы для добавления" : "Доступные группы"} ({filteredGroups.length})</span>
            <span>Заполняемость</span>
          </div>

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

    {/* The price is said ONCE - on the card of the group in the list.  Here: only what changes it (a group without a price; an individual price of the student) */}
    {moneyAvailable && selectedGroup && (selectedGroup.price_current === null || !leavingUndone) && (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs" data-testid="assign-price">
        {selectedGroup.price_current === null && (
          <div className="mb-2 border-b border-slate-200 pb-2" data-testid="assign-price-missing">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-semibold ${scheduledPrices[selectedGroup.id] ? "text-slate-800" : "text-amber-800"}`}>«{selectedGroup.name}»: {priceNotInForceText(scheduledPrices[selectedGroup.id], "цена группы не задана")}</span>
              {groupsBasePath && (
                <a href={groupPriceHref(groupsBasePath, selectedGroup.id)} className="inline-flex min-h-10 items-center font-semibold text-primary-700 hover:underline sm:min-h-0">{scheduledPrices[selectedGroup.id] ? "Цена группы" : "Задать цену группы"}</a>
              )}
            </p>
            {selectedPriceNote && <p className="mt-0.5 text-slate-600">{selectedPriceNote}</p>}
          </div>
        )}
        {!leavingUndone && <EnrolPriceToggle
          idPrefix="assign-group-price"
          enabled={exceptionOn}
          amount={exceptionAmount}
          reason={exceptionReason}
          onEnabled={(value) => { setAssignmentError(null); setExceptionOn(value); }}
          onAmount={(text) => { setAssignmentError(null); setExceptionAmount(text); }}
          onReason={(text) => { setAssignmentError(null); setExceptionReason(text); }}
          compact
        />}
        {!isTransfer && !leavingUndone && openingShown && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <OpeningToggle
              idPrefix="assign-group-opening"
              enabled={openingOn}
              onEnabled={(value) => { setAssignmentError(null); setOpeningOn(value); }}
              values={opening}
              onChange={(next) => { setAssignmentError(null); setOpening(next); }}
              enrolDate={formatBusinessDate()}
              today={formatBusinessDate()}
              accountingStart={accountingStart}
              needsReason={openingNeedsReason}
            />
          </div>
        )}
      </div>
    )}

    {payFromAllowed && (
      <div className="mt-3">
        <PayFromField idPrefix="assign-group" moneyRight={moneyAvailable} def={payDef} value={payFromValue} onChange={(next) => { setAssignmentError(null); setPayFrom(next); }} accountingStart={accountingStart} preview={payPreview} onRetry={payPreview.retry} />
      </div>
    )}

    {transferKey !== null && <TransferPreviewBlock preview={transferPreview.preview} onRetry={transferPreview.retry} target={selectedGroup?.name ?? null} className="mt-3" />}
    {!isTransfer && addPreview.preview.status === "ready" && <PastBalancesNote answer={addPreview.preview.answer} paymentsBase={groupsBasePath && moneyAvailable ? workspaceBases(workspaceOfPath(groupsBasePath)).payments : null} className="mt-3" />}
    {leaveUndo && <LeaveUndoNote undo={leaveUndo} className="mt-3" />}
    {balanceChanged && <Notice variant="warning" compact testId="transfer-changed" className="mt-3">{BALANCE_CHANGED_TEXT}</Notice>}

    {assignmentError && (
      <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-rose-700">
        <X className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{assignmentError}</span>
        {assignmentStale && <Button type="button" variant="secondary" size="sm" data-testid="assign-refresh" onClick={() => { onClose(); window.location.reload(); }}>{REFRESH_LABEL}</Button>}
      </div>
    )}

        </>
    </Modal>
  );
}
