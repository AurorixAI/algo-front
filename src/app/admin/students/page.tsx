"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { orgApi } from "@/lib/api";
import { Users, Search, Brain, GraduationCap, ArrowRight } from "lucide-react";
import Link from "next/link";

interface StudentInfo {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  class_level: number;
  status: string;
  group_id?: string;
  student_phone?: string;
  comment?: string;
  created_at: string | null;
}

const statusLabels: Record<string, { label: string; color: string; dot: string }> = {
  new:        { label: "Новый",           color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-400" },
  diagnosed:  { label: "Диагностирован",  color: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-400" },
  active:     { label: "Активный",        color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400" },
  archived:   { label: "Архив",           color: "bg-slate-50 text-slate-500 border-slate-200",    dot: "bg-slate-400" },
};

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");

  const loadStudents = async () => {
    try {
      const data = await orgApi.listStudents({
        search: search || undefined,
        class_level: filterClass || undefined,
        status: filterStatus || undefined,
      });
      setStudents(Array.isArray(data) ? data : (data as any)?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStudents(); }, [search, filterClass, filterStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ученики</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {students.length > 0
              ? `${students.length} ${students.length === 1 ? "ученик" : students.length < 5 ? "ученика" : "учеников"}`
              : "Ученики появляются после прохождения диагностики"}
          </p>
        </div>
        <Link
          href="/admin/diagnostics"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20"
        >
          <Brain className="w-4 h-4" /> Новая диагностика <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени..."
            className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select value={filterClass ?? ""} onChange={(e) => setFilterClass(e.target.value ? Number(e.target.value) : null)} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500">
          <option value="">Все классы</option>
          {[5, 6, 7, 8, 9, 10, 11].map((n) => <option key={n} value={n}>{n} класс</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500">
          <option value="">Все статусы</option>
          <option value="new">Новые</option>
          <option value="diagnosed">Диагностированы</option>
          <option value="active">Активные</option>
          <option value="archived">Архив</option>
        </select>
      </div>

      {/* Empty state or table */}
      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Пока нет учеников</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            Ученики появятся здесь автоматически после прохождения диагностики. 
            Создайте диагностику и отправьте ссылку ученику.
          </p>
          <Link
            href="/admin/diagnostics"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium"
          >
            <Brain className="w-4 h-4" /> Перейти к диагностике
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Ученик</th>
                <th className="px-6 py-3 font-medium">Класс</th>
                <th className="px-6 py-3 font-medium">Статус</th>
                <th className="px-6 py-3 font-medium">Телефон</th>
                <th className="px-6 py-3 font-medium">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((s, i) => {
                const st = statusLabels[s.status] || statusLabels.new;
                return (
                  <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                          {(s.first_name?.[0] || "").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{s.full_name || `${s.last_name} ${s.first_name}`}</p>
                          {s.comment && <p className="text-xs text-slate-400 truncate max-w-[200px]">{s.comment}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{s.class_level} класс</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${st.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{s.student_phone || "—"}</td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
