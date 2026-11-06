"use client";

import { Select } from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  X,
  Search,
  Users,
  Loader2,
  Check,
  GraduationCap,
  Sparkles,
  CheckCircle2,
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
} from "@/lib/group-price";
import { formAllowsConfirm } from "@/lib/money-preview";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { TransferPreviewBlock } from "./transfer-preview-block";
import { splitTransferNotes } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { staffDisplayName } from "@/lib/staff-name";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";
import { EnrolPriceToggle } from "@/components/payments/price-fields";
import { OpeningToggle } from "@/components/payments/opening-balance-fields";
import { buildOpeningIn, emptyOpeningValues, isReasonRequired, logicaError, validateOpening, validateOpeningReason, type OpeningFormValues } from "@/lib/payments-logica";
import { formatBusinessDate } from "@/lib/business-time";
import { normalizeBilling, payFromErrorText, payFromProblem, payFromRange, payFromRequest } from "@/lib/pay-from";
import { usePayFromDefault, usePayFromPreview } from "@/lib/use-pay-from";
import { PayFromField } from "./pay-from-field";
import { enrolDialogTitle, enrolSubmitLabel } from "@/lib/enrol-labels";
import { Modal } from "@/components/ui/modal";
import { CONFIRM_FOOTER_CLASS, CONFIRM_PRIMARY_BLUE, CONFIRM_PRIMARY_CLASS, ConfirmFooter, MONEY_WINDOW_FORM } from "@/components/money/dialog-footer";

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
  /** Where the group pages of this workspace live (`/owner/groups`): the link «Задать цену группы» leads there. */
  groupsBasePath?: string;
  onClose: () => void;
  onAssigned: (group?: GroupInfo | null) => void;
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
  const [assignedSuccessGroup, setAssignedSuccessGroup] = useState<GroupInfo | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  // Calm notes of the server, e.g. "оплата перенесена в новую группу" (N13 P2.1).
  const [serverInfos, setServerInfos] = useState<string[]>([]);
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  // An individual price is an exception: off by default, a sum and a reason when on.
  const [exceptionOn, setExceptionOn] = useState(false);
  const [exceptionAmount, setExceptionAmount] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  // LOGIC-A decision 1: «оплачено до» / «долг на дату» of the new membership; not with a transfer (the server refuses it).
  const [openingOn, setOpeningOn] = useState(false);
  const [opening, setOpening] = useState<OpeningFormValues>(emptyOpeningValues);
  const [openingNeedsReason, setOpeningNeedsReason] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // re-audit 6 (closing): the individual price of the PRESENT group does not move with the student - said only to a student who really has it (the memberships of the student tell it: `price.source`)
  const [hadOverride, setHadOverride] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  // Money-1 B1 «Оплата с»: the day the student is charged from in the chosen group ("" until the default of that group arrives); a transfer has no such field
  const [payFrom, setPayFrom] = useState("");

  useEffect(() => {
    setHadOverride(false);
    if (!open || !moneyAvailable || !studentId) return undefined;
    let cancelled = false;
    orgApi.getStudentMemberships(studentId)
      .then((rows) => { if (!cancelled) setHadOverride(rows.some((row) => row.is_active !== false && row.price?.source === "override")); })
      .catch(() => { /* quiet: the sentence is only an addition */ });
    return () => { cancelled = true; };
  }, [open, moneyAvailable, studentId]);

  // Load groups & teachers when opened
  useEffect(() => {
    if (open) {
      let cancelled = false;
      setLoading(true);
      setSelectedGroupId(null);
      setAssignedSuccessGroup(null);
      setServerWarnings([]);
      setServerInfos([]);
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
    if (!selectedGroupId || assigning || !transferAllowed) return;
    if (excluded.has(selectedGroupId)) {
      setAssignmentError("Ученик уже состоит в выбранной группе. Выберите другую группу.");
      return;
    }
    const exception = moneyAvailable
      ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason })
      : { error: null, request: null };
    if (exception.error) { setAssignmentError(exception.error); return; }
    if (payProblem) { setAssignmentError(payProblem); return; }
    const todayDate = formatBusinessDate();
    const withOpening = moneyAvailable && !isTransfer && openingOn;
    if (withOpening) {
      const problem = validateOpening(opening, { enrolDate: todayDate, accountingStart, today: todayDate });
      if (problem) { setAssignmentError(problem); return; }
      const reasonProblem = openingNeedsReason ? validateOpeningReason(opening.reason) : null;
      if (reasonProblem) { setAssignmentError(reasonProblem); return; }
    }
    setAssigning(true);
    setAssignmentError(null);
    try {
      const result = await orgApi.addStudentToGroup(selectedGroupId, studentId, {
        mode,
        price_override: exception.request,
        opening_balance: withOpening ? buildOpeningIn(opening) : null,
        pay_from: payBody,
      });
      if (result.status === "unchanged") {
        setSelectedGroupId(null);
        setAssignmentError(isAdd ? "Ученик уже состоит в этой группе." : "Ученик уже состоит в этой группе. Перевод не выполнен.");
        return;
      }
      const notes = splitTransferNotes(result.warnings);
      setServerWarnings(notes.warnings);
      // the server's sentence about the day the charge starts (only when the person chose it)
      const billingLine = payBody ? normalizeBilling(result.billing)?.text : "";
      setServerInfos(billingLine ? [...notes.infos, billingLine] : notes.infos);
      const targetGroup = groups.find((g) => g.id === selectedGroupId) || null;
      setAssignedSuccessGroup(targetGroup);
    } catch (e: any) {
      const failure = logicaError(e);
      if (isReasonRequired(failure) && openingOn) setOpeningNeedsReason(true);
      setAssignmentError(payFromErrorText(failure) || (isReasonRequired(failure) && openingOn ? `${failure.message}. Укажите причину ниже.` : failure.message) || (isAdd ? "Не удалось зачислить ученика в группу" : isTransfer ? "Не удалось перевести ученика в группу" : "Не удалось зачислить ученика в группу"));
    } finally {
      setAssigning(false);
    }
  };

  // R3 #15: «что переедет» - the dry run of the same transfer, asked when the group is chosen; «Перевести» waits for it (a first enrolment carries nothing: no ask)
  const dryException = moneyAvailable ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : { error: null, request: null };
  const transferKey = isTransfer && selectedGroupId && !excluded.has(selectedGroupId) && !dryException.error
    ? `${selectedGroupId}|${studentId}|${JSON.stringify(dryException.request)}`
    : null;
  const transferPreview = useFormMoneyPreview(transferKey, (signal) => (selectedGroupId ? orgApi.dryRunTransferStudent(selectedGroupId, studentId, { price_override: dryException.request }, signal) : Promise.reject(new Error("no group"))));
  const transferAllowed = formAllowsConfirm(transferKey, transferPreview.preview);

  // Money-1 B1: «Оплата с» for ADDING (not a transfer): the default of the chosen group; a past day - the dry run says what is charged at once
  const payFromAllowed = !isTransfer && Boolean(selectedGroupId) && !(selectedGroupId && excluded.has(selectedGroupId));
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
  const selectedPriceNote = selectedGroup ? targetGroupPriceHint(selectedGroup.price_current, 1) : null;

  const closeAfterSuccess = () => {
    if (assignedSuccessGroup) onAssigned(assignedSuccessGroup);
    onClose();
  };

  const successTitle = isAdd ? "Ученик зачислен в группу" : isTransfer ? "Ученик переведён" : "Ученик зачислен";
  const formTitle = enrolDialogTitle(isAdd ? "add" : "transfer", isTransfer);

  return (
    <Modal
      open={open}
      title={assignedSuccessGroup ? successTitle : formTitle}
      description={assignedSuccessGroup ? (
        <span className="font-semibold text-emerald-700">
          {isAdd ? "Прежние группы сохранены" : isTransfer ? "Текущая группа и журнал обновлены" : "Успешно распределен в группу"}
        </span>
      ) : (
        // re-audit В2: who and from where on ONE line under the title (the card «Текущая группа» that scrolled out of sight is gone)
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5" data-testid="assign-current-group">
          <span className="font-semibold text-slate-800">{studentName}</span>{" "}
          {studentGrade && (
            <span className="rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600">{studentGrade} класс</span>
          )}
          {(isTransfer || (isAdd && currentGroupLabel)) && (
            <span className="text-slate-600">
              · {isAdd ? "уже занимается в" : "сейчас в"} «<span className="whitespace-nowrap">{currentGroupLabel || "…"}</span>»
            </span>
          )}
        </span>
      )}
      onClose={closeAfterSuccess}
      busy={assigning}
      maxWidthClassName={MONEY_WINDOW_FORM}
      bodyClassName="px-5 sm:px-6 pt-2 pb-4 overflow-y-auto overscroll-contain min-h-0"
      footerClassName={CONFIRM_FOOTER_CLASS}
      footer={assignedSuccessGroup ? (
        <button
          type="button"
          onClick={() => {
            onAssigned(assignedSuccessGroup);
            onClose();
          }}
          data-testid="assign-done"
          className={`${CONFIRM_PRIMARY_CLASS} ${CONFIRM_PRIMARY_BLUE}`}
        >
          Отлично, закрыть
        </button>
      ) : (
        // re-audit В1: the footer of every window of money; «почему» stands over the off button
        <ConfirmFooter
          primary={assigning ? (isTransfer ? "Переводим…" : "Зачисляем…") : enrolSubmitLabel(isAdd ? "add" : "transfer", isTransfer)}
          onPrimary={() => void handleAssign()}
          busy={assigning}
          disabled={!selectedGroupId || excluded.has(selectedGroupId) || assigning || !transferAllowed || payProblem !== null}
          why={!selectedGroupId ? "Выберите группу" : !transferAllowed ? "Кнопка включится, когда будет посчитано, что изменится" : null}
          whyId="assign-why"
          onCancel={onClose}
          testId="assign-submit"
        />
      )}
    >
      {assignedSuccessGroup ? (
        <div className="flex flex-col">
  <div className="py-10 px-6 sm:px-8 space-y-5 flex flex-col items-center text-center">
    {/* Animated clean badge */}
    <motion.div
      initial={{ scale: 0.4, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="w-20 h-20 rounded-3xl bg-emerald-600 flex items-center justify-center text-white"
    >
      <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
    </motion.div>

    <div className="space-y-2 max-w-sm">
      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-xl font-bold text-slate-900"
      >
        {isTransfer ? "Перевод подтверждён!" : "Зачисление подтверждено!"}
      </motion.h3>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-sm text-slate-500 leading-relaxed"
      >
        {isAdd
          ? "Ученик занимается и в прежних группах; основная группа не изменилась."
          : isTransfer
            ? "Предыдущая группа сохранена в истории, а ученик добавлен в журнал новой группы."
            : "Ученик успешно зачислен в группу и добавлен в журнал занятий."}
      </motion.p>
      {serverInfos.length > 0 && (
        <ul role="status" className="mt-3 list-disc space-y-0.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 pl-8 text-left text-xs text-emerald-900">
          {serverInfos.map((text, index) => <li key={index}>{text}</li>)}
        </ul>
      )}
      {serverWarnings.length > 0 && (
        <ul role="status" className="mt-3 list-disc space-y-0.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 pl-8 text-left text-xs text-amber-900">
          {serverWarnings.map((text, index) => <li key={index}>{text}</li>)}
        </ul>
      )}
    </div>
  </div>

        </div>
      ) : (
        <>
    {/* The current membership is context, not a destination: it stands in the line under the title.  Several current groups: one amber line. */}
    <div className="space-y-2.5 pb-3">
      {isTransfer && (excludeGroupIds?.length ?? 0) > 1 && (
        <p className="text-xs text-amber-800">Членство во всех текущих группах будет закрыто</p>
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
            <button
              onClick={() => {
                setSearch("");
                setSelectedTeacherId("");
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-1 text-xs font-semibold text-slate-600">
            <span>{isTransfer ? "Группы для перевода" : isAdd ? "Группы для добавления" : "Доступные группы"} ({filteredGroups.length})</span>
            <span>Заполняемость</span>
          </div>

          {filteredGroups.map((g) => {
            const isSelected = selectedGroupId === g.id;
            const count = g.student_count ?? g.students_count ?? 0;
            const max = g.max_students || 30;
            const isGradeMatch = studentGrade && g.class_level === studentGrade;

            return (
              <div
                key={g.id}
                onClick={() => {
                  setSelectedGroupId(g.id);
                  setAssignmentError(null);
                }}
                className={`group relative flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-primary-50/80 border-primary-400 shadow-sm ring-2 ring-primary-500/20"
                    : "bg-white border-slate-200/90 hover:border-primary-300 hover:bg-white hover:shadow-xs"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  {/* Selection indicator */}
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? "border-primary-600 bg-primary-600 text-white shadow-xs"
                        : "border-slate-300 bg-white group-hover:border-primary-400 text-transparent"
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`text-sm font-bold truncate ${
                          isSelected ? "text-primary-950" : "text-slate-900"
                        }`}
                      >
                        {g.name}
                      </p>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                        {g.class_level} класс
                      </span>
                      {isGradeMatch && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                          <Sparkles className="w-2.5 h-2.5" />
                          Подходит по классу
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-500">
                      <span>
                        {g.teacher_name ? `Преподаватель: ${g.teacher_name}` : "Преподаватель не назначен"}
                      </span>
                      {moneyAvailable && g.price_current !== undefined && (
                        <span className={g.price_current ? "font-medium text-slate-700" : "font-medium text-amber-700"}>
                          {g.price_current ? formatPrice(g.price_current.amount, priceLabel) : "цена не задана"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capacity tag */}
                <div className="flex-shrink-0 text-right">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 text-xs font-semibold text-slate-700">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {count} <span className="text-slate-500 font-normal">/ {max}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* The price is said ONCE - on the card of the group in the list.  Here: only what changes it (a group without a price; an individual price of the student) */}
    {moneyAvailable && selectedGroup && (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs" data-testid="assign-price">
        {selectedGroup.price_current === null && (
          <div className="mb-2 border-b border-slate-200 pb-2" data-testid="assign-price-missing">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-amber-800">«{selectedGroup.name}»: цена группы не задана</span>
              {groupsBasePath && (
                <a href={groupPriceHref(groupsBasePath, selectedGroup.id)} className="inline-flex min-h-10 items-center font-semibold text-primary-700 hover:underline sm:min-h-0">Задать цену группы</a>
              )}
            </p>
            {selectedPriceNote && <p className="mt-0.5 text-slate-600">{selectedPriceNote}</p>}
          </div>
        )}
        {isTransfer && hadOverride && <p className="mb-2 text-slate-600" data-testid="assign-override-lost">Индивидуальная цена ученика в прежней группе не переносится: он платит по цене новой группы.</p>}
        <EnrolPriceToggle
          idPrefix="assign-group-price"
          enabled={exceptionOn}
          amount={exceptionAmount}
          reason={exceptionReason}
          onEnabled={(value) => { setAssignmentError(null); setExceptionOn(value); }}
          onAmount={(text) => { setAssignmentError(null); setExceptionAmount(text); }}
          onReason={(text) => { setAssignmentError(null); setExceptionReason(text); }}
          compact
        />
        {!isTransfer && (
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

    {transferKey !== null && <TransferPreviewBlock preview={transferPreview.preview} onRetry={transferPreview.retry} className="mt-3" />}

    {assignmentError && (
      <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-rose-700">
        <X className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{assignmentError}</span>
      </div>
    )}

        </>
      )}
    </Modal>
  );
}
