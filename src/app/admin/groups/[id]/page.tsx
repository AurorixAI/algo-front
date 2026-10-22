"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, CalendarDays, UserPlus,
  GraduationCap, Loader2, Edit2, Check, X,
  Archive, Settings2, UserCheck, FileText, Info, ChevronDown, RotateCcw
} from "lucide-react";
import Link from "next/link";
import { orgApi, DEMO_MODE, GroupDetail, GroupStats, GroupInfo } from "@/lib/api";
import { GroupStudentTable } from "@/components/groups/group-student-table";
import { GroupPaymentsTab } from "@/components/groups/group-payments-tab";
import { GROUP_PAYMENTS_LABEL, groupPaymentsAccess, parsePaymentsFilter, paymentsFilterQuery, resolveGroupTab, type PaymentsFilter } from "@/lib/group-payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { GroupStatsPanel } from "@/components/groups/group-stats-panel";
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
import { BookOpen, Wallet } from "lucide-react";

type Tab = "students" | "schedule" | "attendance" | "settings" | "payments";

interface EditState {
  name: string;
  class_level: string;
  teacher_id: string;
  description: string;
  max_students: string;
  lesson_type: LessonType;
}

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

export default function AdminGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = params?.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [stats, setStats] = useState<GroupStats | null>(null);
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [g, s, m] = await Promise.all([
        orgApi.getGroup(groupId),
        orgApi.getGroupStats(groupId).catch(() => null),
        orgApi.listMembers().catch(() => []),
      ]);
      setGroup(g);
      setStats(s);
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
      router.push("/admin/groups");
    } finally {
      setLoading(false);
    }
  }, [groupId, router]);

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

  const handleRestored = (message: string) => {
    setRestoreOpen(false);
    showToast(message);
    void load(true);
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!group) return;
    // The confirmation is the modal of GroupStudentTable.
    try {
      await orgApi.removeStudentFromGroup(groupId, studentId);
      setGroup((prev) => prev ? {
        ...prev,
        students: prev.students.filter((s) => s.id !== studentId),
        student_count: prev.student_count - 1,
      } : null);
      showToast("Ученик убран из группы");
    } catch (e: any) {
      showToast(e.message || "Не удалось убрать ученика", "error");
      throw e;
    }
  };

  // LOGIC-A F9: the dialog of GroupStudentTable has already taken the student out (and settled the money): the page only forgets him.
  const handleStudentLeft = (studentId: string, settled: string[]) => {
    setGroup((prev) => prev ? {
      ...prev,
      students: prev.students.filter((s) => s.id !== studentId),
      student_count: prev.student_count - 1,
    } : null);
    showToast("Ученик убран из группы", "success", settled);
  };

  // LOGIC-A F14: the server took the new type (the dialog opened by «Сохранить» of the edit form); the rest of the form is saved next.
  const handleLessonTypeSaved = (result: GroupLessonTypeChanged) => {
    setGroup((prev) => prev ? { ...prev, lesson_type: result.current } : null);
    setEditState((state) => ({ ...state, lesson_type: result.current }));
    if (editing) void saveFields(false, "Группа обновлена, тип занятий изменён");
    else showToast("Тип занятий изменён");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }
  if (!group) return null;

  const existingIds = new Set(group.students.map((s) => s.id));
  const diagnosedCount = group.students.filter((s) => s.last_theta !== null).length;
  const diagPct = group.student_count > 0
    ? Math.round((diagnosedCount / group.student_count) * 100)
    : 0;

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/admin/groups" className="hover:text-slate-900 flex items-center gap-1 transition-colors">
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
                  <label htmlFor="admin-group-nazvanie-gruppy" className="block text-[13px] font-semibold text-slate-500">
                    Название группы <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <GraduationCap className="w-4.5 h-4.5" />
                    </div>
                    <input
                      id="admin-group-nazvanie-gruppy"
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
                    placeholder="— Не назначен (Учитель отсутствует)"
                    value={editState.teacher_id}
                    onChange={(e) => setEditState((s) => ({ ...s, teacher_id: e.target.value }))}
                    options={[
                      { value: "", label: "— Не назначен (Учитель отсутствует)" },
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
                  <label htmlFor="admin-group-maksimum-uchenikov" className="block text-[13px] font-semibold text-slate-500">
                    Максимум учеников
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                      <Users className="w-4 h-4" />
                    </div>
                    <input
                      id="admin-group-maksimum-uchenikov"
                      type="number"
                      min={Math.max(1, group.student_count)}
                      max={200}
                      value={editState.max_students}
                      onChange={(e) => setEditState((s) => ({ ...s, max_students: e.target.value }))}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none transition-all"
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
                  <label htmlFor="admin-group-opisanie-gruppy" className="block text-[13px] font-semibold text-slate-500">
                    Описание группы
                  </label>
                  <textarea
                    id="admin-group-opisanie-gruppy"
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="w-14 h-14 shrink-0 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                    <GraduationCap className="w-7 h-7 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="break-words text-xl font-bold text-slate-900">{group.name}</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {group.class_level ? `${group.class_level} класс · ` : ""}
                      {group.teacher_name ? `Учитель: ${group.teacher_name}` : "Учитель не назначен"}
                      {group.max_students && ` · Макс. ${group.max_students} учеников`}
                    </p>
                    {/* LOGIC-A F14: the type of the lessons (plain text: it is changed in the edit form, #126) */}
                    <p className="mt-1 text-sm text-slate-600" data-testid="group-lesson-type-line">{lessonTypeLine(group.lesson_type)}</p>
                    {group.description && (
                      <p className="text-xs text-slate-400 mt-1 max-w-lg">{group.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
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
                    <>
                      <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:border-slate-300 hover:text-slate-900 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Изменить
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiveOpen(true)}
                        className="flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                        title="Архивировать группу"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        В архив
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex max-w-full items-center gap-1 overflow-x-auto bg-slate-100 rounded-xl p-1 w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Разделы группы">
        {([
          { key: "students",  label: "Ученики",   Icon: Users    },
          { key: "schedule", label: "Расписание", Icon: CalendarDays },
          { key: "attendance", label: "Посещаемость", Icon: BookOpen },
          ...(paymentsAccess === "show" ? [{ key: "payments", label: GROUP_PAYMENTS_LABEL, Icon: Wallet }] : []),
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key as Tab)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 sm:px-4 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="hidden h-3.5 w-3.5 sm:block" />
            {label}
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
              onRemove={group.status === "active" ? handleRemoveStudent : undefined}
              groupId={groupId}
              onLeft={handleStudentLeft}
              canRemove={group.status === "active"}
            />
          </motion.div>
        )}

        {tab === "schedule" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <GroupScheduleOverview groupId={groupId} groupName={group.name} viewerRole="admin" archived={group.status === "archived"} />
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
              groupsBasePath="/admin/groups"
              studentsBasePath="/admin/students"
              paymentsBasePath="/admin/payments"
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
              studentProfileBasePath="/admin/students"
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
        groupsBasePath="/admin/groups"
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
        groupsBasePath="/admin/groups"
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

      {toastNode}
    </div>
  );
}
