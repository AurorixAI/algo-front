"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { examsApi, ExamSummary } from "@/lib/api";
import {
  FileText, Search, Plus, Clock, CheckCircle, XCircle,
  Users, Copy, Check, ExternalLink, Eye,
} from "lucide-react";
import Link from "next/link";

type ExamInfo = ExamSummary;

const statusConfig: Record<string, { label: string; color: string; dot: string; icon: any }> = {
  draft:     { label: "Черновик",     color: "bg-slate-50 text-slate-600 border-slate-200",       dot: "bg-slate-400",   icon: Clock },
  active:    { label: "Активный",     color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-400", icon: CheckCircle },
  closed:    { label: "Завершён",     color: "bg-red-50 text-red-600 border-red-200",             dot: "bg-red-400",     icon: XCircle },
  generated: { label: "Сгенерирован", color: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-400",    icon: FileText },
};

export default function AdminExamsPage() {
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    try {
      const data = await examsApi.list();
      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load exams:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyLink = (code: string) => {
    const url = window.location.origin + "/e/" + code;
    navigator.clipboard.writeText(url);
    setCopiedCode("link-" + code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filtered = exams.filter((e) => {
    if (filter !== "all" && e.status !== filter) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: exams.length,
    draft: exams.filter((e) => e.status === "draft").length,
    active: exams.filter((e) => e.status === "active").length,
    closed: exams.filter((e) => e.status === "closed").length,
  };

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
          <h1 className="text-2xl font-bold text-slate-900">Экзамены</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Управление экзаменами, вариантами и результатами
          </p>
        </div>
        <Link
          href="/teacher/exams/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors font-medium shadow-sm shadow-primary-600/20"
        >
          <Plus className="w-4 h-4" /> Создать экзамен
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Всего", value: counts.all, icon: FileText, color: "text-slate-600", bg: "bg-slate-50", key: "all" },
          { label: "Черновики", value: counts.draft, icon: Clock, color: "text-amber-600", bg: "bg-amber-50", key: "draft" },
          { label: "Активные", value: counts.active, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50", key: "active" },
          { label: "Завершённые", value: counts.closed, icon: XCircle, color: "text-red-500", bg: "bg-red-50", key: "closed" },
        ].map((stat) => (
          <button
            key={stat.key}
            onClick={() => setFilter(stat.key)}
            className={
              "p-4 rounded-xl border transition-all text-left " +
              (filter === stat.key
                ? "border-primary-200 bg-primary-50/50 shadow-sm"
                : "border-slate-100 bg-white hover:border-slate-200")
            }
          >
            <div className="flex items-center justify-between mb-2">
              <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + stat.bg}>
                <stat.icon className={"w-4 h-4 " + stat.color} />
              </div>
              <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
            </div>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по названию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Exam list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400">Нет экзаменов</p>
          <p className="text-slate-400 text-sm mt-1">
            Нажмите &quot;Создать экзамен&quot; чтобы начать
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exam, i) => {
            const sc = statusConfig[exam.status] || statusConfig.draft;
            return (
              <motion.div
                key={exam.exam_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white rounded-xl border border-slate-100 p-4 transition-all hover:shadow-sm"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200 text-primary-700 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{exam.title}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{exam.variants_count} {exam.variants_count === 1 ? "вариант" : "вариантов"}</span>
                      <span>&middot;</span>
                      <span>{exam.tasks_count} задач</span>
                      <span>&middot;</span>
                      <span>
                        {new Date(exam.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Sessions count */}
                  <div className="flex items-center gap-1.5 text-sm text-slate-500 mr-2">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{exam.sessions_count}</span>
                  </div>

                  {/* Status badge */}
                  <div
                    className={
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border " + sc.color
                    }
                  >
                    <div className={"w-1.5 h-1.5 rounded-full " + sc.dot} />
                    {sc.label}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {exam.access_code && (
                      <>
                        <button
                          onClick={() => copyLink(exam.access_code!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
                          title="Скопировать ссылку"
                        >
                          {copiedCode === "link-" + exam.access_code ? (
                            <><Check className="w-3.5 h-3.5" /> Скопировано</>
                          ) : (
                            <><ExternalLink className="w-3.5 h-3.5" /> Ссылка</>
                          )}
                        </button>
                        <button
                          onClick={() => copyCode(exam.access_code!)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Скопировать код"
                        >
                          {copiedCode === exam.access_code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    {exam.status === "draft" && (
                      <Link
                        href={`/teacher/exams/${exam.exam_id}/draft`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Редактировать
                      </Link>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
