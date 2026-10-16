"use client";

import { motion } from "framer-motion";
import { GraduationCap, Users, ChevronRight, Archive, BookOpen } from "lucide-react";
import Link from "next/link";
import { GroupInfo } from "@/lib/api";
import { LEVEL_CATEGORY_META, LEVEL_TONES } from "@/lib/diagnostic-level";
import { lessonTypeLabel } from "@/lib/payroll";

interface GroupCardProps {
  group: GroupInfo & { avg_level?: "below_grade" | "at_grade" | "above_grade" | null };
  href: string;
  index?: number;
}

export function GroupCard({ group, href, index = 0 }: GroupCardProps) {
  const fillPct = group.max_students > 0
    ? Math.min(100, Math.round(((group.student_count || 0) / group.max_students) * 100))
    : 0;
  const level = group.avg_level;
  const levelCfg = level
    ? { label: LEVEL_CATEGORY_META[level].label, color: LEVEL_TONES[LEVEL_CATEGORY_META[level].tone].badge }
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative bg-white rounded-2xl p-6 border border-slate-100 hover:border-primary-200 hover:shadow-xl hover:shadow-primary-100/40 transition-all duration-300 group flex flex-col h-full overflow-hidden"
    >
      {/* Decorative gradient ribbon at the top */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary-500 via-violet-400 to-emerald-400" />

      {/* Decorative background blob */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-primary-100 to-indigo-100 rounded-full blur-3xl opacity-30 group-hover:opacity-60 transition-opacity duration-500 -mr-10 -mt-10 pointer-events-none" />
      
      <div className="relative z-10 flex items-start justify-between mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-50 to-indigo-50 flex items-center justify-center text-primary-600 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm shadow-primary-100/50">
          <BookOpen className="w-7 h-7" />
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {/* Status Badge */}
          {group.status === "active" && !group.teacher_id ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-amber-50 text-amber-700 border-amber-200">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Ожидание
            </div>
          ) : (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${group.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${group.status === "active" ? "bg-emerald-400" : "bg-slate-400"}`} />
              {group.status === "active" ? "Активна" : "Архив"}
            </div>
          )}
          
          <div className="flex items-center gap-1">
            {/* Visual arrow (actual link covers whole card, but arrow animates on hover) */}
            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors pointer-events-none">
              <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
      
      <h3 className="relative z-10 text-xl font-bold text-slate-900 mb-2 group-hover:text-primary-600 transition-colors line-clamp-2 leading-tight">
        {group.name}
      </h3>
      
      <div className="relative z-10 flex flex-wrap items-center gap-2 mb-6 text-sm text-slate-500">
        <span className="flex items-center gap-1.5 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/50 backdrop-blur-sm">
          <GraduationCap className="w-4 h-4 text-slate-500" /> {group.class_level ? `${group.class_level} класс` : "Без класса"}
        </span>
        <span
          data-testid="group-lesson-type"
          className="flex items-center gap-1.5 bg-primary-50/70 text-primary-700 px-3 py-1.5 rounded-xl border border-primary-100 font-medium"
        >
          {lessonTypeLabel(group.lesson_type)}
        </span>
        {group.teacher_name && (
          <span className="text-slate-400 px-1 truncate max-w-[120px]">
            {group.teacher_name}
          </span>
        )}
        {levelCfg && (
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border backdrop-blur-sm ${levelCfg.color}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {levelCfg.label}
          </span>
        )}
      </div>

      <div className="relative z-10 mt-auto">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-400" />
            {group.student_count || 0} / {group.max_students || "∞"} учеников
          </span>
          <span className="text-slate-400">{fillPct}% заполненность</span>
        </div>
        
        {group.max_students > 0 && (
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out ${fillPct >= 100 ? "bg-rose-500" : fillPct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Full card link overlay */}
      {href ? (
        <Link href={href} className="absolute inset-0 z-10">
          <span className="sr-only">Открыть группу {group.name}</span>
        </Link>
      ) : null}
    </motion.div>
  );
}
