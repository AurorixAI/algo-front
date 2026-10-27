"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, UserPlus, Users, CalendarDays,
  GraduationCap, Loader2, Edit2, Check, X,
  Archive, Tag, Info, RotateCcw, Wallet, BookOpen,
} from "lucide-react";
import Link from "next/link";
import { orgApi, DEMO_MODE, GroupDetail, type StudentInGroup } from "@/lib/api";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupPaymentsTab } from "@/components/groups/group-payments-tab";
import { GROUP_TAB_LABELS, groupPaymentsAccess, parsePaymentsFilter, paymentsFilterQuery, resolveGroupTab, type PaymentsFilter } from "@/lib/group-payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { GroupAttendanceJournal } from "@/components/groups/group-attendance-journal";
import { GroupScheduleOverview } from "@/components/groups/group-schedule-overview";
import { Select } from "@/components/ui/select";
import { AddStudentDrawer, type AddStudentsResult } from "@/components/groups/add-student-drawer";
import { enrolToast } from "@/lib/group-enrol";
import { ENROL_STUDENTS_BUTTON_LABEL } from "@/lib/enrol-labels";
import { staffDisplayName } from "@/lib/staff-name";
import { handoverTargets } from "@/lib/staff-lifecycle";
import { GroupArchiveDialog, GroupArchivedBanner, GroupRestoreDialog } from "@/components/groups/group-archive-dialog";
import { opsErrorCode, teacherConflictLines, opsErrorDetail } from "@/lib/ops-errors";
import type { TeacherBusyDetail } from "@/lib/ops-b-types";
import { LESSON_TYPES, normalizeLessonType, type LessonType } from "@/lib/payroll";
import { GroupLessonTypeDialog } from "@/components/groups/group-lesson-type-dialog";
import { LESSON_TYPE_EDIT_NOTE, lessonTypeChangedInEdit, lessonTypeLine, type GroupLessonTypeChanged } from "@/lib/group-lesson-type";
import { useToast } from "@/components/ui/toast";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { GroupPriceAction } from "@/components/groups/group-price-action";
import { GROUP_HEADER_LABEL, groupDebtChipText, groupDebtSummary, groupHeaderActions, groupPriceChipText, groupWorkspacePaths, type GroupDebtSummary, type Workspace } from "@/lib/group-workspace";
import { priceLabelOf } from "@/lib/group-price";
import { groupPaymentsHref } from "@/lib/group-payments";
import { NumberInput } from "@/components/ui/number-input";

type Tab = "students" | "schedule" | "attendance" | "payments";

interface EditState {
  name: string;
  class_level: string;
  teacher_id: string;
  description: string;
  max_students: string;
  lesson_type: LessonType;
}

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

/**
 * The page of one group, for the owner and for the administrator (IA audit F9: it used to be two copies that differed in their ids and
 * paths only).  `workspace` decides the paths of the links and of the other screens of the group (students, payments, schedule).
 */
export function GroupDetailView({ workspace }: { workspace: Workspace }) {
  const paths = groupWorkspacePaths(workspace);
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const requestedTab = searchParams?.get("tab");
  // #126: the tab «Оплаты» is for the owner and for an administrator with the money right; never on an archived group
  const moneyAvailable = usePaymentsSummary((state) => state.available);
  const moneyLoaded = usePaymentsSummary((state) => state.loaded);
  const refreshMoney = usePaymentsSummary((state) => state.refresh);
  useEffect(() => { void refreshMoney(); }, [refreshMoney]);
  const paymentsAccess = groupPaymentsAccess({ moneyAvailable, moneyLoaded, archived: group?.status === "archived", demo: DEMO_MODE });
  const tab: Tab = resolveGroupTab(requestedTab, paymentsAccess);
  const paymentsFilter = parsePaymentsFilter(searchParams?.get("filter"));
  const setPaymentsFilter = (filter: PaymentsFilter) => router.replace(paymentsFilterQuery(filter), { scroll: false });
  const setTab = (newTab: Tab) => {
    router.replace(`?tab=${newTab}`, { scroll: false });
  };
  // a strip that does not fit (a narrow phone, a deep link to «Оплаты») shows the active tab, never cut at the edge
  const tabStrip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const strip = tabStrip.current;
    const active = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !active) return;
    const over = active.offsetLeft + active.offsetWidth - (strip.scrollLeft + strip.clientWidth);
    if (over > 0) strip.scrollLeft += over + 4;
    else if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = Math.max(0, active.offsetLeft - 4);
  }, [tab, group]);

  // Inline edit
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState>({
    name: "", class_level: "", teacher_id: "", description: "", max_students: "30", lesson_type: "group",
  });
  const [saving, setSaving] = useState(false);
  const { showToast, toastNode } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [lessonTypeOpen, setLessonTypeOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  /** «Перевести в другую группу…» of a row of the roster. */
  const [transferStudent, setTransferStudent] = useState<StudentInGroup | null>(null);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  // The debt of the group for the chip of the header (only while the tab «Оплаты» exists for this role)
  const [debt, setDebt] = useState<GroupDebtSummary | null>(null);
  const [debtTick, setDebtTick] = useState(0); // a price or a lesson type just changed: the debt of the group is read again

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [g, m] = await Promise.all([
        orgApi.getGroup(groupId),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroup(g);
      setMembers(Array.isArray(m) ? m : []);
      setEditState({
        name: g.name,
        class_level: String(g.class_level ?? ""),
        teacher_id: g.teacher_id ?? "",
        description: g.description ?? "",
        max_students: String(g.max_students),
        lesson_type: normalizeLessonType(g.lesson_type),
      });
    } catch {
      router.push(paths.groups);
    } finally {
      setLoading(false);
    }
  }, [groupId, router, paths.groups]);

  useEffect(() => { if (groupId) load(); }, [load]);

  const handleStudentsAdded = (result: AddStudentsResult) => {
    setAddOpen(false);
    void load(true);
    const toast = enrolToast(result);
    showToast(toast.text, toast.type, toast.details);
  };

  // everybody who can teach: teachers, the owner and the administrators (the role is named next to the name)
  const teachers = handoverTargets(members).map((t) => ({ id: t.id, name: t.label }));

  /**
   * Saves the fields of the form.  The type of the lessons is NOT among them when it was changed: that goes through the dialog
   * «Тип занятий» (the date it takes effect, what changes in payroll, the history), see `handleSave` / `handleLessonTypeSaved`.
   */
  const saveFields = async (withType: boolean, text = "Группа обновлена") => {
    if (!editState.name.trim() || !group) return;
    setSaving(true);
    try {
      const updated = await orgApi.updateGroup(group.id, {
        name: editState.name.trim(),
        class_level: editState.class_level ? Number(editState.class_level) : null,
        teacher_id: editState.teacher_id || null,
        description: editState.description.trim() || undefined,
        max_students: Number(editState.max_students) || 30,
        ...(withType ? { lesson_type: editState.lesson_type } : {}),
      });
      setGroup((prev) => prev ? { ...prev, ...updated } : null);
      setEditing(false);
      showToast(text);
    } catch (e: any) {
      if (opsErrorCode(e) === "TEACHER_BUSY") {
        // O5: the new teacher has a lesson at the same time - say which, as details of the toast
        showToast(e.message || "У преподавателя уже есть урок в это время", "error", teacherConflictLines(opsErrorDetail<TeacherBusyDetail>(e), 5));
      } else {
        showToast(e.message || "Ошибка сохранения", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editState.name.trim() || !group) return;
    // A changed type first shows its consequences (the dialog); an unchanged one is saved as before.
    if (lessonTypeChangedInEdit(group.lesson_type, editState.lesson_type)) { setLessonTypeOpen(true); return; }
    await saveFields(true);
  };

  /** O4: archiving asks the server what is in the way (the dialog), then archives; the group page reloads. */
  const handleArchived = (message: string) => {
    setArchiveOpen(false);
    showToast(message);
    void load(true);
  };

  const handleRestored = (message: string, notes?: string[]) => {
    setRestoreOpen(false);
    showToast(message, notes?.length ? "warning" : "success", notes);
    void load(true);
  };

  // LOGIC-A F9: the dialog of GroupStudentTable has already taken the student out (and settled the money): the page only forgets him.
  const handleStudentLeft = (studentId: string, settled: string[]) => {
    setGroup((prev) => prev ? {
      ...prev,
      students: prev.students.filter((s) => s.id !== studentId),
      student_count: prev.student_count - 1,
    } : null);
    setDebtTick((n) => n + 1);
    showToast("Ученик убран из группы", "success", settled);
  };

  // LOGIC-A F14: the server took the new type (the dialog opened by «Сохранить» of the edit form); the rest of the form is saved next.
  const handleLessonTypeSaved = (result: GroupLessonTypeChanged) => {
    setGroup((prev) => prev ? { ...prev, lesson_type: result.current } : null);
    setEditState((state) => ({ ...state, lesson_type: result.current }));
    if (editing) void saveFields(false, "Группа обновлена, тип занятий изменён");
    else showToast("Тип занятий изменён");
  };

  // IA audit F30: «Долг N» of the header (one request for the debtors of this group; read again when the tab changes)
  const debtEnabled = paymentsAccess === "show" && Boolean(group);
  useEffect(() => {
    if (!debtEnabled) { setDebt(null); return undefined; }
    let cancelled = false;
    orgApi.getPaymentsStatus({ bucket: "debt", groupId, limit: 500, offset: 0 })
      .then((result) => { if (!cancelled) setDebt(groupDebtSummary(result.items ?? [])); })
      .catch(() => { if (!cancelled) setDebt(null); });
    return () => { cancelled = true; };
  }, [debtEnabled, groupId, tab, debtTick]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }
  if (!group) return null;

  const priceChip = paymentsAccess === "show" ? groupPriceChipText(group.price_current, priceLabelOf(periodMode)) : null;
  const debtChip = paymentsAccess === "show" && debt ? groupDebtChipText(debt) : null;
  const headerMenu: RowMenuItem[] = groupHeaderActions({ archived: group.status === "archived", priceAvailable: paymentsAccess === "show" }).map((action) => {
    if (action === "edit") return { key: action, label: GROUP_HEADER_LABEL.edit, icon: Edit2, onSelect: () => setEditing(true) };
    if (action === "price") return { key: action, label: GROUP_HEADER_LABEL.price, icon: Tag, onSelect: () => setPriceOpen(true) };
    return { key: action, label: GROUP_HEADER_LABEL.archive, icon: Archive, danger: true, onSelect: () => setArchiveOpen(true) };
  });

  const existingIds = new Set(group.students.map((s) => s.id));
  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={paths.groups} className="hover:text-slate-900 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Группы
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-medium truncate max-w-xs">{group.name}</span>
        {group.status === "archived" && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500 border border-slate-200">Архив</span>
        )}
      </div>

      {group.status === "archived" && (
        <GroupArchivedBanner archivedAt={group.archivedAt} studentCount={group.student_count} onRestore={() => setRestoreOpen(true)} />
      )}

      {/* Group header card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      >
        <div className="p-6">
          {editing ? (
            /* ── Edit form ── */
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Редактирование группы</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Изменение названия, преподавателя и лимитов мест</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Group Name */}
                <div className="col-span-2 space-y-2">
                  <label htmlFor="group-nazvanie-gruppy" className="block text-[13px] font-semibold text-slate-500">
                    Название группы <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <input
                      id="group-nazvanie-gruppy"
                      value={editState.name}
                      onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                      placeholder="например, 9-А Математика (Профиль)"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Teacher Selection */}
                <div className="col-span-2">
                  <Select
                    label="Преподаватель группы"
                    placeholder="— Не назначен"
                    value={editState.teacher_id}
                    onChange={(e) => setEditState((s) => ({ ...s, teacher_id: e.target.value }))}
                    options={[
                      { value: "", label: "— Не назначен" },
                      ...teachers.map((t) => ({ value: t.id, label: t.name })),
                    ]}
                  />
                </div>

                {/* Class Level */}
                <div>
                  <Select
                    label="Класс обучения"
                    placeholder="Без указания класса"
                    value={editState.class_level}
                    onChange={(e) => setEditState((s) => ({ ...s, class_level: e.target.value }))}
                    options={[
                      { value: "", label: "Без указания класса" },
                      ...CLASS_LEVELS.map((n) => ({ value: String(n), label: `${n} класс` })),
                    ]}
                  />
                </div>

                {/* Max Students */}
                <div className="space-y-2">
                  <label htmlFor="group-maksimum-uchenikov" className="block text-[13px] font-semibold text-slate-500">
                    Максимум учеников
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <NumberInput
                      id="group-maksimum-uchenikov"
                      stepper
                      min={Math.max(1, group.student_count)}
                      max={200}
                      value={editState.max_students}
                      onChange={(next) => setEditState((s) => ({ ...s, max_students: next }))}
                      className="w-full pl-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all"
                    />
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                    <span>Сейчас в группе: <strong className="text-slate-700">{group.student_count}</strong> учеников · мин. {group.student_count || 1}</span>
                  </p>
                </div>

                {/* Lesson type (N13 P3: the payroll counts a percent per type) */}
                <div className="col-span-2">
                  <Select
                    label="Тип занятий"
                    value={editState.lesson_type}
                    onChange={(e) => setEditState((s) => ({ ...s, lesson_type: normalizeLessonType(e.target.value) }))}
                    options={LESSON_TYPES.map((type) => ({ value: type.key, label: type.label }))}
                  />
                  {/* LOGIC-A B1: the server writes the type history from today */}
                  <p className="mt-1 text-xs text-slate-500" data-testid="lesson-type-edit-note">{LESSON_TYPE_EDIT_NOTE}</p>
                </div>

                {/* Description */}
                <div className="col-span-2 space-y-2">
                  <label htmlFor="group-opisanie-gruppy" className="block text-[13px] font-semibold text-slate-500">
                    Описание группы
                  </label>
                  <textarea
                    id="group-opisanie-gruppy"
                    value={editState.description}
                    onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                    rows={2}
                    placeholder="Дополнительная информация о группе, расписании или целях обучения..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSave}
                    disabled={!editState.name.trim() || saving || Number(editState.max_students) < group.student_count}
                    className="flex items-center gap-2 px-7 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? "Сохранение…" : "Сохранить изменения"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-5 py-3 text-slate-500 hover:text-slate-800 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Отмена
                  </button>
                </div>

                {Number(editState.max_students) < group.student_count && (
                  <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    Лимит не может быть меньше {group.student_count} учеников
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <div>
              {/* The «⋯» menu stays top-right of the title at every width; only the wide «Вернуть из архива» button drops under the title on a phone */}
              <div data-testid="group-header-row" className={`flex items-start justify-between gap-3 ${group.status === "archived" ? "flex-col sm:flex-row sm:gap-4" : "sm:gap-4"}`}>
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <div className="w-14 h-14 shrink-0 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                    <GraduationCap className="w-7 h-7 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="break-words text-xl font-bold text-slate-900 md:text-2xl">{group.name}</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {group.class_level ? `${group.class_level} класс · ` : ""}
                      {group.teacher_name ? `Преподаватель: ${group.teacher_name}` : "Преподаватель не назначен"}
                      {group.max_students && ` · Макс. ${group.max_students} учеников`}
                    </p>
                    {/* LOGIC-A F14: the type of the lessons (plain text: it is changed in the edit form, #126) */}
                    <p className="mt-1 text-sm text-slate-600" data-testid="group-lesson-type-line">{lessonTypeLine(group.lesson_type)}</p>
                    {/* IA audit F30: the price and the debt of the group, one click from the tab «Оплаты» */}
                    {(priceChip || debtChip) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="group-money-chips">
                        {priceChip && (
                          <Link href={groupPaymentsHref(paths.groups, group.id)} data-testid="group-price-chip" className={`rounded-md border px-2 py-0.5 text-xs font-semibold hover:underline ${group.price_current ? "border-slate-200 bg-slate-50 text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{priceChip}</Link>
                        )}
                        {debtChip && (
                          <Link href={groupPaymentsHref(paths.groups, group.id, "debt")} data-testid="group-debt-chip" className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 hover:underline">{debtChip}</Link>
                        )}
                      </div>
                    )}
                    {group.description && (
                      <p className="text-xs text-slate-400 mt-1 max-w-lg">{group.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {group.status === "archived" ? (
                    <button
                      type="button"
                      onClick={() => setRestoreOpen(true)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-xs cursor-pointer"
                      title="Вернуть группу из архива"
                    >
                      <RotateCcw className="w-4 h-4 text-emerald-600" />
                      Вернуть из архива
                    </button>
                  ) : (
                    <RowMenu items={headerMenu} label={`Действия: ${group.name}`} width={240} />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div ref={tabStrip} data-testid="group-tabs" className="flex w-full max-w-full items-center gap-1 overflow-x-auto bg-slate-100 rounded-xl p-1 sm:w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Разделы группы">
        {([
          { key: "students", Icon: Users },
          { key: "schedule", Icon: CalendarDays },
          { key: "attendance", Icon: BookOpen },
          ...(paymentsAccess === "show" ? [{ key: "payments", Icon: Wallet }] : []),
        ] as const).map(({ key, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key as Tab)}
            className={`flex min-w-0 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium transition-all sm:flex-none sm:px-4 sm:text-sm ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="hidden h-3.5 w-3.5 sm:block" />
            <span className="sm:hidden">{GROUP_TAB_LABELS[key as Tab].short}</span>
            <span className="hidden sm:inline">{GROUP_TAB_LABELS[key as Tab].full}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "students" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <p className="font-semibold text-slate-900">
                Состав группы
                <span className="ml-2 text-sm font-normal text-slate-400">({group.student_count})</span>
              </p>
              {group.status === "active" && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                >
                  <UserPlus className="h-4 w-4" />
                  {ENROL_STUDENTS_BUTTON_LABEL}
                </button>
              )}
            </div>
            <GroupStudentTable
              students={group.students}
              studentBasePath={paths.students}
              groupId={groupId}
              onLeft={handleStudentLeft}
              canRemove={group.status === "active"}
              onTransfer={setTransferStudent}
            />
          </motion.div>
        )}

        {tab === "schedule" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <GroupScheduleOverview groupId={groupId} groupName={group.name} viewerRole={paths.viewerRole} archived={group.status === "archived"} teacherAssigned={Boolean(group.teacher_id || group.teacher_name)} />
          </motion.div>
        )}

        {tab === "payments" && paymentsAccess === "pending" && (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>
        )}

        {tab === "payments" && paymentsAccess === "show" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <GroupPaymentsTab
              groupId={groupId}
              groupName={group.name}
              groupPrice={group.price_current}
              groupsBasePath={paths.groups}
              studentsBasePath={paths.students}
              paymentsBasePath={paths.payments}
              joinedAt={Object.fromEntries(group.students.map((student) => [student.id, student.joined_at]))}
              filter={paymentsFilter}
              onFilterChange={setPaymentsFilter}
            />
          </motion.div>
        )}

        {tab === "attendance" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <GroupAttendanceJournal
              groupId={groupId}
              students={group.students || []}
              canEdit={group.status !== "archived"}
              adminMode
              groupName={group.name}
              studentProfileBasePath={paths.students}
              initialMonth={searchParams?.get("month")}
              highlightLessonId={searchParams?.get("lesson")}
              highlightDate={searchParams?.get("date")}
            />
          </motion.div>
        )}
      </div>

      <AddStudentDrawer
        open={addOpen}
        groupId={groupId}
        groupClassLevel={group.class_level}
        groupPrice={group.price_current}
        groupsBasePath={paths.groups}
        existingStudentIds={existingIds}
        onClose={() => setAddOpen(false)}
        onAdded={handleStudentsAdded}
      />

      <GroupLessonTypeDialog
        open={lessonTypeOpen}
        groupId={group.id}
        groupName={group.name}
        initialType={editing ? editState.lesson_type : undefined}
        onSaved={handleLessonTypeSaved}
        onClose={() => setLessonTypeOpen(false)}
      />

      <GroupArchiveDialog
        open={archiveOpen}
        group={{ id: group.id, name: group.name, class_level: group.class_level }}
        groupsBasePath={paths.groups}
        onClose={() => setArchiveOpen(false)}
        onArchived={handleArchived}
      />
      <GroupRestoreDialog
        open={restoreOpen}
        group={{ id: group.id, name: group.name }}
        teachers={teachers}
        onClose={() => setRestoreOpen(false)}
        onRestored={handleRestored}
      />

      <GroupPriceAction
        open={priceOpen}
        groupId={group.id}
        groupName={group.name}
        onClose={() => setPriceOpen(false)}
        onSaved={(wasSet) => { setPriceOpen(false); showToast(wasSet ? "Цена группы изменена" : "Цена группы задана"); setDebtTick((n) => n + 1); void load(true); }}
        onError={(message) => showToast(message, "error")}
      />

      {transferStudent && (
        <AssignGroupModal
          open
          studentId={transferStudent.id}
          studentName={transferStudent.full_name || `${transferStudent.last_name} ${transferStudent.first_name}`}
          studentGrade={transferStudent.class_level}
          mode="transfer"
          currentGroupId={group.id}
          currentGroupName={group.name}
          excludeGroupIds={[group.id]}
          groupsBasePath={paths.groups}
          onClose={() => setTransferStudent(null)}
          onAssigned={() => { setTransferStudent(null); void load(true); }}
        />
      )}

      {toastNode}
    </div>
  );
}
