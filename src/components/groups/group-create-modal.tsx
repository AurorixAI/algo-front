"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Users, GraduationCap, Hash, Type, Layers, AlignLeft, Loader2, BookOpen } from "lucide-react";
import { orgApi, GroupInfo } from "@/lib/api";
import { staffDisplayName } from "@/lib/staff-name";
import { DEFAULT_LESSON_TYPE, LESSON_TYPES, normalizeLessonType, type LessonType } from "@/lib/payroll";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/components/ui/modal";

interface GroupCreateModalProps {
  open: boolean;
  teachers: { id: string; first_name: string; last_name: string; org_role: string }[];
  onClose: () => void;
  onCreated: (group: GroupInfo) => void;
  selfAssignTeacher?: boolean;
}

const CLASS_LEVELS = [5, 6, 7, 8, 9, 10, 11];

export function GroupCreateModal({ open, teachers, onClose, onCreated, selfAssignTeacher = false }: GroupCreateModalProps) {
  const [form, setForm] = useState({
    name: "",
    class_level: 9,
    teacher_id: "",
    description: "",
    max_students: 30,
    lesson_type: DEFAULT_LESSON_TYPE as LessonType,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        class_level: 9,
        teacher_id: "",
        description: "",
        max_students: 30,
        lesson_type: DEFAULT_LESSON_TYPE,
      });
      setError(null);
    }
  }, [open]);
  useScrollLock(open);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const group = await orgApi.createGroup({
        name: form.name.trim(),
        class_level: form.class_level || undefined,
        ...(selfAssignTeacher ? {} : { teacher_id: form.teacher_id || undefined }),
        description: form.description.trim() || undefined,
        max_students: form.max_students,
        // A teacher creating a group for himself does not choose the kind: it is a plain «Группа» (the owner changes it).
        ...(selfAssignTeacher ? {} : { lesson_type: form.lesson_type }),
      });
      onCreated(group);
    } catch (e: any) {
      setError(e.message || "Ошибка создания группы");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const modalContent = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] touch-none"
            onClick={handleClose}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="bg-white rounded-[24px] shadow-2xl border border-slate-100 w-full max-w-[480px] pointer-events-auto overflow-hidden flex flex-col"
            >

              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/50 flex items-center justify-center border border-primary-100">
                    <GraduationCap className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Новая группа</h2>
                    <p className="text-xs text-slate-500">Заполните данные для создания</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-2 space-y-5 overflow-y-auto overscroll-contain max-h-[60vh]">
                {/* Name */}
                <div className="space-y-1">
                  <label htmlFor="group-create-nazvanie-gruppy" className="text-sm font-medium text-slate-700">Название группы</label>
                  <div className="relative">
                    <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="group-create-nazvanie-gruppy"
                      autoFocus
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Например: 5А, Алгебра-профи"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Class level */}
                  <div>
                    <label htmlFor="group-create-klass" className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Класс
                    </label>
                    <div className="relative">
                      <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        id="group-create-klass"
                        value={form.class_level}
                        onChange={(e) => setForm({ ...form, class_level: Number(e.target.value) })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none appearance-none"
                      >
                        {CLASS_LEVELS.map((n) => (
                          <option key={n} value={n}>{n} класс</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Max students */}
                  <div>
                    <label htmlFor="group-create-maks-uchenikov" className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Макс. учеников
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="group-create-maks-uchenikov"
                        type="number"
                        min={1}
                        max={100}
                        value={form.max_students}
                        onChange={(e) => setForm({ ...form, max_students: Math.min(100, Math.max(1, Number(e.target.value))) })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Lesson type: set by the owner and the administrator, not by a teacher who creates a group for himself */}
                {!selfAssignTeacher && (
                  <div>
                    <label htmlFor="group-lesson-type" className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Тип занятий
                    </label>
                    <div className="relative">
                      <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        id="group-lesson-type"
                        value={form.lesson_type}
                        onChange={(e) => setForm({ ...form, lesson_type: normalizeLessonType(e.target.value) })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none appearance-none"
                      >
                        {LESSON_TYPES.map((type) => (
                          <option key={type.key} value={type.key}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Teacher */}
                {selfAssignTeacher ? (
                  <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">Преподаватель: вы</p>
                    <p className="mt-0.5 text-xs text-slate-500">Группа будет закреплена за вами сразу после создания.</p>
                  </div>
                ) : teachers.length > 0 && (
                  <div>
                    <label htmlFor="group-create-uchitel" className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Учитель
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select
                        id="group-create-uchitel"
                        value={form.teacher_id}
                        onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none appearance-none"
                      >
                        <option value="">Без преподавателя (Не назначен)</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {staffDisplayName(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label htmlFor="group-create-opisanie" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Описание
                  </label>
                  <div className="relative">
                    <AlignLeft className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      id="group-create-opisanie"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Дополнительная информация о группе..."
                      rows={3}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all focus:bg-white focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none resize-none"
                    />
                  </div>
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-3 bg-red-50/80 border border-red-200 rounded-xl text-sm text-red-600 flex items-start gap-2">
                    <span className="shrink-0 font-bold">Ошибка:</span> {error}
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 pt-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3 mt-2">
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!form.name.trim() || saving}
                  className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-primary-600/20 active:scale-95"
                >
                  {saving ? "Создание…" : "Создать группу"}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(modalContent, document.body) : null;
}
