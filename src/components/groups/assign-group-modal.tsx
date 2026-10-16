"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Users,
  Loader2,
  Check,
  GraduationCap,
  UserCheck,
  User,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { orgApi, type GroupJoinMode } from "@/lib/api";
import { splitTransferNotes, transferPaymentHint } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { staffDisplayName } from "@/lib/staff-name";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";

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
  onClose,
  onAssigned,
}: AssignGroupModalProps) {
  const isAdd = mode === "add";
  const isTransfer = !isAdd && Boolean(currentGroupId || currentGroupName);
  const excluded = useMemo(() => new Set([...(excludeGroupIds ?? []), ...(currentGroupId ? [currentGroupId] : [])]), [excludeGroupIds, currentGroupId]);
  const [mounted, setMounted] = useState(false);
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
  const paymentHint = transferPaymentHint({ transfer: isTransfer, moneyAvailable });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // This modal is rendered through a portal. Lock both scrolling roots so the
  // background cannot move and the backdrop also covers the browser scrollbar
  // gutter (locking only `body` leaves `html` scrollable in some browsers).
  useEffect(() => {
    if (!open) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [open]);

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
    if (!selectedGroupId || assigning) return;
    if (excluded.has(selectedGroupId)) {
      setAssignmentError("Ученик уже состоит в выбранной группе. Выберите другую группу.");
      return;
    }
    setAssigning(true);
    setAssignmentError(null);
    try {
      const result = await orgApi.addStudentToGroup(selectedGroupId, studentId, { mode });
      if (result.status === "unchanged") {
        setSelectedGroupId(null);
        setAssignmentError(isAdd ? "Ученик уже состоит в этой группе." : "Ученик уже состоит в этой группе. Перевод не выполнен.");
        return;
      }
      const notes = splitTransferNotes(result.warnings);
      setServerWarnings(notes.warnings);
      setServerInfos(notes.infos);
      const targetGroup = groups.find((g) => g.id === selectedGroupId) || null;
      setAssignedSuccessGroup(targetGroup);
    } catch (e: any) {
      setAssignmentError(e.message || (isAdd ? "Не удалось добавить ученика в группу" : isTransfer ? "Не удалось перевести ученика в группу" : "Не удалось зачислить ученика в группу"));
    } finally {
      setAssigning(false);
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {open && (
        <div className="fixed left-0 top-0 z-[99999] h-[100dvh] w-screen overflow-y-auto overscroll-contain flex items-center justify-center p-3 sm:p-4">
          {/* `w-screen` deliberately includes the scrollbar gutter. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed left-0 top-0 h-[100dvh] w-screen bg-slate-950/60 backdrop-blur-md"
            onClick={() => {
              if (assignedSuccessGroup) {
                onAssigned(assignedSuccessGroup);
              }
              onClose();
            }}
          />

          {/* Modal Container with Fixed Stable Dimensions */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col z-10"
          >
            {assignedSuccessGroup ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col"
              >
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 leading-tight">
                        {isAdd ? "Ученик добавлен в группу" : isTransfer ? "Ученик переведён" : "Ученик зачислен"}
                      </h2>
                      <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                        {isAdd ? "Прежние группы сохранены" : isTransfer ? "Текущая группа и журнал обновлены" : "Успешно распределен в группу"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onAssigned(assignedSuccessGroup);
                      onClose();
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body / Clean Professional Confirmation */}
                <div className="py-10 px-6 sm:px-8 space-y-5 flex flex-col items-center text-center">
                  {/* Animated clean badge */}
                  <motion.div
                    initial={{ scale: 0.4, rotate: -10 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/25 ring-8 ring-emerald-50"
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
                      {isAdd ? "Добавление подтверждено!" : isTransfer ? "Перевод подтверждён!" : "Зачисление подтверждено!"}
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

                {/* Footer */}
                <div className="p-4 sm:p-5 border-t border-slate-100 bg-white flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onAssigned(assignedSuccessGroup);
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Отлично, закрыть</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-primary-500/20">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 leading-tight">
                        {isAdd ? "Добавить в ещё одну группу" : isTransfer ? "Перевести в другую группу" : "Зачисление в группу"}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span>Ученик:</span>
                        <span className="font-semibold text-slate-800">{studentName}</span>
                        {studentGrade && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded font-medium text-[11px]">
                            {studentGrade} класс
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

            {/* Current membership is context, not a selectable destination. */}
            <div className="px-6 pt-5 pb-4 bg-slate-50/80 border-b border-slate-100 space-y-3 flex-shrink-0">
              {(isTransfer || (isAdd && currentGroupLabel)) && (
                <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">{isAdd ? "Уже занимается в группах" : "Текущая группа"}</p>
                    <p className="truncate text-sm font-bold text-indigo-950">
                      {currentGroupLabel || "Определяем группу ученика…"}
                      {!isAdd && currentGroup?.class_level ? ` · ${currentGroup.class_level} класс` : ""}
                    </p>
                    {!isAdd && currentGroup?.teacher_name && (
                      <p className="truncate text-xs text-indigo-700">Преподаватель: {currentGroup.teacher_name}</p>
                    )}
                    {isTransfer && (excludeGroupIds?.length ?? 0) > 1 && (
                      <p className="text-xs text-amber-700">Членство во всех текущих группах будет закрыто</p>
                    )}
                    {paymentHint && <p className="text-xs text-indigo-600/80">{paymentHint}</p>}
                  </div>
                </div>
              )}

              {/* Teacher Selector */}
              <div>
                <label htmlFor="assign-group-prepodavatel" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Преподаватель
                </label>
                <div className="relative">
                  <select
                    id="assign-group-prepodavatel"
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full appearance-none pl-3.5 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none cursor-pointer shadow-2xs"
                  >
                    <option value="">Все преподаватели</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {staffDisplayName(t)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Поиск по названию группы или классу..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none shadow-2xs"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Groups List with Constant Fixed Height to prevent jumping */}
            <div className="p-5 h-[340px] max-h-[340px] overflow-y-auto bg-slate-50/40 flex-shrink-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                  <p className="text-xs font-medium text-slate-500">Загрузка доступных групп...</p>
                </div>
              ) : loadError ? (
                <div className="flex h-full items-center justify-center px-3">
                  <DataLoadError
                    compact
                    title="Не удалось загрузить группы"
                    message={loadError}
                    onRetry={() => setReloadNonce((current) => current + 1)}
                  />
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400 mb-3">
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
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1 mb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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

                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                              <span>
                                {g.teacher_name ? `Учитель: ${g.teacher_name}` : "Преподаватель не назначен"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Capacity tag */}
                        <div className="flex-shrink-0 text-right">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 text-xs font-semibold text-slate-700">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {count} <span className="text-slate-400 font-normal">/ {max}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {assignmentError && (
              <div role="alert" className="mx-5 mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-rose-700">
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{assignmentError}</span>
              </div>
            )}

            {/* Symmetrical Footer with Equal Buttons */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-white grid grid-cols-2 gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center py-2.5 sm:py-3 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all shadow-2xs"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!selectedGroupId || excluded.has(selectedGroupId) || assigning}
                className={`w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${
                  !selectedGroupId || excluded.has(selectedGroupId)
                    ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                    : "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20 hover:from-primary-700 hover:to-indigo-700 cursor-pointer"
                }`}
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isAdd ? "Добавляем..." : isTransfer ? "Переводим..." : "Зачисление..."}</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>{isAdd ? "Добавить в группу" : isTransfer ? "Перевести в группу" : "Зачислить в группу"}</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
