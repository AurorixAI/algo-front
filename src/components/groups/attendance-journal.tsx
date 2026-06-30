"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  FileWarning,
  Loader2,
  Users,
  AlertCircle
} from "lucide-react";
import { orgApi, StudentInGroup, GroupAttendance, AttendanceStatus } from "@/lib/api";

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: any; color: string; bg: string }> = {
  present: { label: "Присутствовал", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 hover:bg-emerald-100" },
  absent: { label: "Пропустил", icon: XCircle, color: "text-red-500", bg: "bg-red-50 hover:bg-red-100" },
  excused: { label: "Уважительная", icon: FileWarning, color: "text-slate-400", bg: "bg-slate-50 hover:bg-slate-100" },
  late: { label: "Опоздал", icon: Clock, color: "text-amber-500", bg: "bg-amber-50 hover:bg-amber-100" },
};

interface AttendanceJournalProps {
  groupId: string;
  students: StudentInGroup[];
}

export function AttendanceJournal({ groupId, students }: AttendanceJournalProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<GroupAttendance | null>(null);
  
  const [records, setRecords] = useState<Record<string, Record<string, AttendanceStatus>>>({});
  
  const [openPopover, setOpenPopover] = useState<{ lessonId: string; studentId: string } | null>(null);

  const fetchAttendance = async (date: Date) => {
    setLoading(true);
    try {
      const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const data = await orgApi.getGroupAttendance(groupId, monthStr);
      setAttendance(data);
      setRecords(data.records || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance(currentDate);
  }, [currentDate, groupId]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthLabel = currentDate.toLocaleString("ru-RU", { month: "long", year: "numeric" });

  const handleStatusChange = async (lessonId: string, studentId: string, status: AttendanceStatus) => {
    // Optimistic update
    setRecords((prev) => ({
      ...prev,
      [lessonId]: {
        ...(prev[lessonId] || {}),
        [studentId]: status,
      },
    }));
    setOpenPopover(null);

    // Persist to backend (in background)
    try {
      await orgApi.updateAttendance(groupId, lessonId, [{ student_id: studentId, status }]);
    } catch (e) {
      console.error("Failed to save attendance");
      // Ideally revert state on failure
    }
  };


  if (loading && !attendance) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-4" />
        <p className="text-slate-500">Загрузка журнала...</p>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Users className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">В группе пока нет учеников</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      {/* Header Controls */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-semibold text-slate-900">Журнал посещаемости</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-slate-900 w-32 text-center capitalize">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto relative min-h-[400px]">
        {attendance?.lessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <AlertCircle className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">Нет уроков в этом месяце</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {/* Sticky Student Column */}
                <th className="sticky left-0 z-20 bg-white border-b border-r border-slate-100 p-4 text-left min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  <span className="font-medium text-slate-500">Ученик</span>
                </th>
                
                {attendance?.lessons.map((lesson) => {
                  const dateObj = new Date(lesson.date + "T12:00:00");
                  return (
                    <th key={lesson.id} className="border-b border-r border-slate-100 bg-white min-w-[120px]">
                      <div className="p-3 text-center flex flex-col items-center gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {dateObj.getDate()} {dateObj.toLocaleString("ru", { month: "short" })}
                          </p>
                          <p className="text-[10px] text-slate-400 capitalize">
                            {dateObj.toLocaleString("ru", { weekday: "short" })}
                          </p>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-slate-50/50 group/row">
                  {/* Sticky Student Name */}
                  <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50/50 border-b border-r border-slate-100 p-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-[10px] font-bold text-primary-700 shrink-0">
                        {student.first_name[0]?.toUpperCase() || "?"}
                      </div>
                      <span className="font-medium text-slate-900 truncate max-w-[140px]" title={student.full_name || student.last_name + " " + student.first_name}>
                        {student.last_name} {student.first_name}
                      </span>
                    </div>
                  </td>

                  {/* Attendance Cells */}
                  {attendance?.lessons.map((lesson) => {
                    const status = records[lesson.id]?.[student.id];
                    const config = status ? STATUS_CONFIG[status] : null;
                    const isOpen = openPopover?.lessonId === lesson.id && openPopover?.studentId === student.id;

                    return (
                      <td key={lesson.id} className="border-b border-r border-slate-100 relative">
                        <div className="flex items-center justify-center h-full w-full p-2">
                          <button
                            onClick={() => setOpenPopover(isOpen ? null : { lessonId: lesson.id, studentId: student.id })}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              config ? config.bg : "hover:bg-slate-100 text-slate-300"
                            }`}
                          >
                            {config ? (
                              <config.icon className={`w-4 h-4 ${config.color}`} />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                            )}
                          </button>
                        </div>

                        {/* Popover */}
                        <AnimatePresence>
                          {isOpen && (
                            <>
                              <div 
                                className="fixed inset-0 z-30" 
                                onClick={() => setOpenPopover(null)} 
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                transition={{ duration: 0.15 }}
                                className="absolute z-40 top-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-lg border border-slate-100 p-1.5 min-w-[160px]"
                              >
                                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                  <button
                                    key={key}
                                    onClick={() => handleStatusChange(lesson.id, student.id, key as AttendanceStatus)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-left"
                                  >
                                    <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                                    {cfg.label}
                                  </button>
                                ))}
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
