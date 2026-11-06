"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Check, Loader2 } from "lucide-react";
import { orgApi, type GroupJoinMode } from "@/lib/api";
import {
  checkEnrolOverride,
  enrolPriceHint,
  groupPriceHref,
  priceLabelOf,
  targetGroupPriceHint,
  targetGroupPriceText,
  type GroupPriceBrief,
} from "@/lib/group-price";
import { splitTransferNotes } from "@/lib/payments";
import { buildOpeningIn, emptyOpeningValues, isReasonRequired, logicaError, validateOpening, validateOpeningReason, type OpeningFormValues } from "@/lib/payments-logica";
import { formatBusinessDate, formatDateRu } from "@/lib/business-time";
import { normalizeBilling, payFromErrorText, payFromProblem, payFromRange, payFromRequest } from "@/lib/pay-from";
import { usePayFromDefault, usePayFromPreview } from "@/lib/use-pay-from";
import { ENROL_HERE_ADD_LABEL, ENROL_HERE_TRANSFER_LABEL, ENROL_STUDENTS_TITLE } from "@/lib/enrol-labels";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { availableStudents, poolSearchTerm, studentPoolQuery } from "@/lib/student-pool";
import { studentGroupId, studentStatusKey, studentStatusLabel } from "@/lib/student-status";
import { EnrolPriceToggle } from "@/components/payments/price-fields";
import { OpeningToggle } from "@/components/payments/opening-balance-fields";
import { formAllowsConfirm } from "@/lib/money-preview";
import { useFormMoneyPreview } from "@/lib/use-money-preview";
import { TransferPreviewBlock } from "./transfer-preview-block";
import { PayFromField } from "./pay-from-field";
import { canManageMoney } from "@/lib/money-effects";
import { effectiveEnrolMode, secondGroupLine } from "@/lib/enrol-mode";
import { useAuthStore } from "@/lib/store";
import { Modal } from "@/components/ui/modal";
import { ConfirmFooter } from "@/components/money/dialog-footer";

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
}

interface AddStudentDrawerProps {
  open: boolean;
  groupId: string;
  groupClassLevel?: number | null;
  /**
   * The price of this group today (`price_current` of the group): `null` - not set, `undefined` - the role does not
   * see money (the key is absent).  The students added here take it.
   */
  groupPrice?: GroupPriceBrief | null;
  /** Where the groups live («/owner/groups»): «Задать цену группы» leads to the page «Оплаты -> Цены групп» next to it. */
  groupsBasePath?: string;
  existingStudentIds: Set<string>;
  onClose: () => void;
  onAdded: (result: AddStudentsResult) => void;
}

export function AddStudentDrawer({
  open, groupId, groupClassLevel, groupPrice, groupsBasePath, existingStudentIds, onClose, onAdded,
}: AddStudentDrawerProps) {
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  // Picked students are kept as objects: they stay selected (and keep their
  // «из другой группы» hint) when the list reloads under another class filter.
  const [selected, setSelected] = useState<Map<string, Student>>(new Map());
  const [adding, setAdding] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);
  // Students already in another group: move them here or keep both groups.
  const [chosenMode, setMode] = useState<GroupJoinMode>("transfer");
  // R3 M2: a transfer moves money - the money right only; without it the mode is «add» and the switch is not there
  const moneyRight = canManageMoney(useAuthStore((state) => state.user));
  const mode = effectiveEnrolMode(chosenMode, moneyRight);
  // Money is offered only to users the server lets see it (owner; administrator when allowed).
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const accountingStart = usePaymentsSummary((state) => state.accountingStart);
  // The center's mode names the price («Цена в месяц» / «Цена пакета»).
  const priceLabel = priceLabelOf(usePaymentsSummary((state) => state.periodMode));
  // An individual price is an exception: off by default, a sum and a reason when on (one for everybody added now).
  const [exceptionOn, setExceptionOn] = useState(false);
  const [exceptionAmount, setExceptionAmount] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  // LOGIC-A decision 1: what the student had before ALGO («оплачено до» / «долг на дату»); one student at a time, never with a transfer.
  const [openingOn, setOpeningOn] = useState(false);
  const [opening, setOpening] = useState<OpeningFormValues>(emptyOpeningValues);
  const [openingNeedsReason, setOpeningNeedsReason] = useState(false);
  // Money-1 B1 «Оплата с»: the day the added student is charged from ("" until the server's default arrives)
  const [payFrom, setPayFrom] = useState("");
  // By default only the group's own class is offered; «Все классы» drops that filter.
  const [allClasses, setAllClasses] = useState(false);
  // Latest-request-wins: a slow answer for the previous filter (fast «Все классы» toggle, typing)
  // must not replace the list of the current one.
  const [listSeq] = useState(() => createRequestSequence());

  useEffect(() => {
    if (!open) return;
    setMode("transfer");
    setExceptionOn(false);
    setExceptionAmount("");
    setExceptionReason("");
    setOpeningOn(false);
    setOpening(emptyOpeningValues());
    setOpeningNeedsReason(false);
    setAllClasses(false);
    setPayFrom("");
  }, [open]);

  // Group names for the "currently in ..." hints; a failure only drops the hints.
  useEffect(() => {
    if (!open) return;
    setAddError(null);
    let cancelled = false;
    orgApi.listGroups()
      .then((list) => {
        if (cancelled) return;
        const items = Array.isArray(list) ? list : (list as any)?.items || [];
        setGroupNames(Object.fromEntries(items.map((g: any) => [g.id, g.name])));
      })
      .catch(() => { if (!cancelled) setGroupNames({}); });
    return () => { cancelled = true; };
  }, [open]);

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
  const currentGroupOf = (s: Student) => studentGroupId(s);

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

  const toggle = (student: Student) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(student.id)) next.delete(student.id);
      else next.set(student.id, student);
      return next;
    });
  };

  // Students not already in the group; archived ones are never offered, and without a search
  // neither are students of other groups.
  const available = availableStudents(students, existingStudentIds, { ungroupedOnly: !searching });

  // Selected students who are enrolled elsewhere: adding moves them.
  const transfers = Array.from(selected.values())
    .filter((s) => { const current = studentGroupId(s); return current && current !== groupId; })
    .map((s) => ({
      id: s.id,
      name: s.full_name || `${s.last_name} ${s.first_name}`.trim(),
      from: groupNames[studentGroupId(s) as string] || "другой группы",
    }));

  // Shown only to users who see money, and only for «Перевести в эту группу».
  const priceHint = enrolPriceHint({ transfer: mode === "transfer", moneyAvailable });
  // The price of this group, shown to money roles only (the key is absent for the others).
  const priceLine = moneyAvailable ? targetGroupPriceText(groupPrice, priceLabel) : null;
  const priceNote = moneyAvailable ? targetGroupPriceHint(groupPrice, selected.size) : null;

  // The opening balance belongs to ONE student who comes new (a transfer closes memberships: the server refuses it then).
  const today = formatBusinessDate();
  const openingAllowed = moneyAvailable && selected.size === 1 && (transfers.length === 0 || mode === "add");
  // Money-1 B1: «Оплата с» belongs to ADDING a student; a transfer has its own day (the server refuses the field there)
  const payFromAllowed = selected.size > 0 && (transfers.length === 0 || mode === "add");
  const { def: payDef } = usePayFromDefault(groupId, open && payFromAllowed);
  useEffect(() => { if (payDef) setPayFrom((current) => current || payDef.default_pay_from); }, [payDef]);
  const payRange = payFromRange(payDef?.today ?? today, accountingStart);
  // the default is there from the first frame the server answered (no flash of an empty date)
  const payFromValue = payFrom || payDef?.default_pay_from || "";
  const payBody = payFromAllowed ? payFromRequest(payFromValue, payDef, moneyAvailable) : null;
  const payProblem = payFromAllowed && moneyAvailable ? payFromProblem(payFromValue, payDef, payRange) : null;

  // R3 #15: «что переедет» - the dry run of the same bulk transfer (`mode=transfer&dry_run=true`), asked when somebody from another group is chosen; «Зачислить» waits for it
  const dryException = moneyAvailable ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason }) : { error: null, request: null };
  // UX pack №15: every chosen student is moved from another group (the mode «Перевести в эту группу») - the button says so, not «Зачислить»
  const movesOnly = transfers.length > 0 && transfers.length === selected.size && mode === "transfer" && moneyRight;
  const transferIds = Array.from(selected.keys()).sort();
  const transferKey = open && transfers.length > 0 && mode === "transfer" && !dryException.error
    ? `${groupId}|${transferIds.join(",")}|${JSON.stringify(dryException.request)}`
    : null;
  const transferPreview = useFormMoneyPreview(transferKey, (signal) => orgApi.dryRunBulkTransfer(groupId, transferIds, { price_override: dryException.request }, signal));
  const transferAllowed = formAllowsConfirm(transferKey, transferPreview.preview);
  // Money-1 B1: a day in the past charges the past at once - for ONE student the server's dry run says how much, before the button
  const pickedIds = Array.from(selected.keys()).sort();
  const payPreviewKey = open && moneyAvailable && payFromAllowed && payBody !== null && payBody < (payDef?.today ?? "") && pickedIds.length > 0 && !dryException.error && !payProblem
    ? `${groupId}|${pickedIds.join(",")}|${payBody}|${JSON.stringify(dryException.request)}` : null;
  const payPreview = usePayFromPreview(payPreviewKey, (signal) => orgApi.dryRunBulkAdd(groupId, pickedIds, { pay_from: payBody as string, price_override: dryException.request }, signal));
  const pickedNames = new Map(Array.from(selected.values()).map((s) => [s.id, s.full_name || `${s.last_name} ${s.first_name}`.trim()]));

  const handleAdd = async () => {
    if (selected.size === 0 || !transferAllowed) return;
    const exception = moneyAvailable
      ? checkEnrolOverride({ enabled: exceptionOn, amount: exceptionAmount, reason: exceptionReason })
      : { error: null, request: null };
    if (exception.error) { setAddError(exception.error); return; }
    if (payProblem) { setAddError(payProblem); return; }
    const withOpening = openingAllowed && openingOn;
    if (withOpening) {
      const problem = validateOpening(opening, { enrolDate: today, accountingStart, today });
      if (problem) { setAddError(problem); return; }
      const reasonProblem = openingNeedsReason ? validateOpeningReason(opening.reason) : null;
      if (reasonProblem) { setAddError(reasonProblem); return; }
    }
    setAdding(true);
    setAddError(null);
    try {
      const picked = Array.from(selected.values());
      const nameOf = (id: string) => {
        const s = picked.find((item) => item.id === id);
        return s ? (s.full_name || `${s.last_name} ${s.first_name}`.trim()) : "Ученик";
      };
      const openingBody = withOpening ? buildOpeningIn(opening) : null;
      // One student with an opening balance goes through the route that takes it; the bulk route has no such field.
      // One student with an opening balance - or with a chosen «Оплата с» - goes through the route that answers `billing` (the server's sentence); the bulk route has no such field.
      const singleRoute = Boolean(openingBody) || (payBody !== null && picked.length === 1);
      let billingLine: string | null = null;
      const result = singleRoute
        ? await orgApi.addStudentToGroup(groupId, picked[0].id, {
          mode: transfers.length > 0 ? mode : undefined,
          price_override: exception.request,
          opening_balance: openingBody,
          pay_from: payBody,
        }).then((single) => {
          billingLine = payBody ? normalizeBilling(single.billing)?.text || null : null;
          return {
            added: single.status === "added" ? 1 : 0,
            skipped: single.status === "added" ? 0 : 1,
            skipped_details: single.status === "added" ? [] : [{ student_id: picked[0].id, reason: "уже в этой группе" }],
            warnings: single.warnings,
          };
        })
        : await orgApi.bulkAddStudents(groupId, Array.from(selected.keys()), {
          // The mode only matters for students who are already in another group.
          mode: transfers.length > 0 ? mode : undefined,
          price_override: exception.request,
          pay_from: payBody,
        });
      setSelected(new Map());
      const notes = splitTransferNotes(result.warnings, nameOf);
      if (payBody && !billingLine && result.added > 0) billingLine = `Оплата считается с ${formatDateRu(payBody)}: так выбрал сотрудник`;
      onAdded({
        added: result.added,
        skipped: result.skipped,
        skippedLines: (result.skipped_details || []).map((d) => `${nameOf(d.student_id)} — ${d.reason}`),
        warnings: notes.warnings,
        infos: billingLine ? [...notes.infos, billingLine] : notes.infos,
      });
    } catch (e: any) {
      const failure = logicaError(e, "Ошибка добавления учеников");
      if (isReasonRequired(failure) && openingOn) setOpeningNeedsReason(true);
      setAddError(payFromErrorText(failure) ?? (isReasonRequired(failure) && openingOn ? `${failure.message}. Укажите причину ниже.` : failure.message));
    } finally {
      setAdding(false);
    }
  };

  const statusColors: Record<string, string> = {
    new:       "bg-blue-50 text-blue-700",
    diagnosed: "bg-amber-50 text-amber-700",
    active:    "bg-emerald-50 text-emerald-700",
    archived:  "bg-slate-100 text-slate-500",
    no_group:  "bg-slate-100 text-slate-600",
  };

  // The class filter is on: the group has a class and «Все классы» is off.
  const classFilterOn = Boolean(groupClassLevel) && !allClasses;

  return (
    <Modal
      open={open}
      placement="right"
      title={movesOnly && groupNames[groupId] ? `Перевести в «${groupNames[groupId]}»` : ENROL_STUDENTS_TITLE}
      description={selected.size > 0 ? `Выбрано: ${selected.size}` : "Выберите учеников для зачисления"}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      bodyClassName="flex-1 min-h-0 flex flex-col"
      footerClassName="flex flex-col gap-2 p-3 sm:p-4 sm:gap-3"
      footer={
        <>
        {transfers.length > 0 && !moneyRight && (
          <div role="note" data-testid="enrol-second-group" className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {transfers.map((t) => <p key={t.id}>{secondGroupLine(t)}</p>)}
          </div>
        )}
        {transfers.length > 0 && moneyRight && (
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-slate-600">
              {transfers.length === 1 ? "Ученик уже в другой группе" : `Уже в другой группе: ${transfers.length}`}
            </legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup">
              {([
                ["transfer", ENROL_HERE_TRANSFER_LABEL],
                ["add", ENROL_HERE_ADD_LABEL],
              ] as const).map(([value, title]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold leading-tight transition-all ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {title}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {mode === "transfer" ? "Прошлая группа закроется, эта станет основной" : "Прошлые группы останутся, основная не изменится"}
            </p>
            {priceHint && <p className="mt-0.5 text-xs text-slate-500">{priceHint}</p>}
          </fieldset>
        )}
        {moneyAvailable && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
            {priceLine && (
              <>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`font-semibold ${groupPrice ? "text-slate-800" : "text-amber-800"}`}>{priceLine}</span>
                  {groupPrice === null && (
                    <a href={groupPriceHref(groupsBasePath ?? "", groupId)} onClick={onClose} className="font-semibold text-primary-700 hover:underline">Задать цену группы</a>
                  )}
                </p>
                {priceNote && <p className="mt-0.5 text-slate-500">{priceNote}</p>}
                {priceHint && transfers.length === 0 && <p className="mt-0.5 text-xs text-slate-500">{priceHint}</p>}
              </>
            )}
            <div className={priceLine ? "mt-2 border-t border-slate-200 pt-2" : ""}>
              <EnrolPriceToggle
                idPrefix="add-student-price"
                enabled={exceptionOn}
                amount={exceptionAmount}
                reason={exceptionReason}
                onEnabled={(value) => { setAddError(null); setExceptionOn(value); }}
                onAmount={(text) => { setAddError(null); setExceptionAmount(text); }}
                onReason={(text) => { setAddError(null); setExceptionReason(text); }}
                shared={selected.size > 1}
                compact
              />
            </div>
          </div>
        )}
        {openingAllowed && (
          <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
            <OpeningToggle
              idPrefix="add-student-opening"
              enabled={openingOn}
              onEnabled={(value) => { setAddError(null); setOpeningOn(value); }}
              values={opening}
              onChange={(next) => { setAddError(null); setOpening(next); }}
              enrolDate={today}
              today={today}
              accountingStart={accountingStart}
              needsReason={openingNeedsReason}
            />
          </div>
        )}
        {payFromAllowed && (
          <PayFromField idPrefix="add-student" moneyRight={moneyAvailable} def={payDef} value={payFromValue} onChange={(next) => { setAddError(null); setPayFrom(next); }} accountingStart={accountingStart} preview={payPreview} onRetry={payPreview.retry} names={pickedNames} />
        )}
        {transferKey !== null && <TransferPreviewBlock className="" preview={transferPreview.preview} onRetry={transferPreview.retry} names={new Map(transfers.map((student) => [student.id, student.name]))} />}
        {addError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{addError}</p>
        )}
        {/* re-audit В1: the footer of every window of money */}
        <ConfirmFooter
          primary={adding ? (movesOnly ? "Перевод…" : "Зачисление…") : `${movesOnly ? "Перевести" : "Зачислить"}${selected.size > 0 ? ` (${selected.size})` : ""}`}
          onPrimary={() => void handleAdd()}
          busy={adding}
          disabled={selected.size === 0 || adding || !transferAllowed || payProblem !== null}
          why={selected.size === 0 ? "Выберите учеников" : !transferAllowed ? "Кнопка включится, когда будет посчитано, что изменится" : payProblem}
          whyId="enrol-why"
          onCancel={onClose}
          testId="enrol-submit"
        />
        </>
      }
    >
      {/* Search */}
      <div className="p-4 border-b border-slate-50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или ID…"
            autoFocus
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>
        {groupClassLevel ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={allClasses}
              onClick={() => setAllClasses((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-md px-1 text-xs font-medium transition-colors ${allClasses ? "text-primary-700" : "text-slate-500 hover:text-slate-600"}`}
            >
              {allClasses && <Check className="h-3 w-3" aria-hidden="true" />}
              Все классы
            </button>
          </div>
        ) : null}
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tooShort && <p className="px-4 pt-3 text-xs text-slate-500">Введите минимум 2 символа</p>}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : available.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            {searching
              ? `Ничего не найдено${classFilterOn ? ". Попробуйте «Все классы»" : ""}`
              : "Нет учеников без группы. Найдите ученика по имени или ID, чтобы перевести или добавить его в эту группу."}
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {available.map((s) => {
              const isSelected = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${isSelected ? "bg-primary-50/50" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                    isSelected ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {isSelected ? <Check className="w-4 h-4" /> : (s.first_name?.[0] || "?").toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {s.full_name || `${s.last_name} ${s.first_name}`}
                    </p>
                    <p className="text-xs text-slate-500 break-words">
                      {s.class_level} класс
                      {currentGroupOf(s) && currentGroupOf(s) !== groupId && (
                        <span className="text-amber-700"> · сейчас в «{groupNames[currentGroupOf(s) as string] || "другой группе"}»</span>
                      )}
                    </p>
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusColors[studentStatusKey(s)] || statusColors.new}`}>
                    {studentStatusLabel(s)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!loading && totalFound > students.length && (
          <p className="px-4 py-3 text-xs text-slate-500 text-center">
            Показаны первые {students.length} из {totalFound}. Уточните поиск, чтобы найти остальных.
          </p>
        )}
      </div>

    </Modal>
  );
}
