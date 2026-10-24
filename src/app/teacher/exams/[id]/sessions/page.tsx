"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  CheckCircle,
  Clock,
  Trophy,
  TrendingUp,
  Download,
} from "lucide-react";
import { examsApi } from "@/lib/api";
import { formatUtcNaiveAsBusinessTime } from "@/lib/business-time";
import { buildExamSessionsCsv } from "@/lib/exam-sessions-csv";
import { DataLoadError, getDataLoadErrorMessage } from "@/components/ui/data-load-error";

interface SessionSummary {
  session_id: string;
  student_name: string;
  variant_number: number;
  status: string;
  score: number;
  max_score: number;
  correct_count: number;
  total_tasks: number;
  percentage: number;
  time_spent_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PercentBadge({ pct }: { pct: number }) {
  const color =
    pct >= 80
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 60
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`px-2 py-0.5 rounded-full text-sm font-semibold ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

export default function ExamSessionsPage() {
  const { id: examId } = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [examTitle, setExamTitle] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      examsApi.getSessions(examId),
      examsApi.getDraft(examId).catch(() => null),
    ])
      .then(([sData, draft]) => {
        setSessions(Array.isArray(sData) ? sData : []);
        if (draft) setExamTitle(draft.title);
      })
      .catch((error) => setLoadError(getDataLoadErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [examId, refreshNonce]);

  const submitted = sessions.filter((s) => s.status === "submitted");
  const inProgress = sessions.filter((s) => s.status !== "submitted");
  const avgPct =
    submitted.length > 0
      ? submitted.reduce((acc, s) => acc + s.percentage, 0) / submitted.length
      : 0;

  const exportCsv = () => {
    // RFC 4180 + a guard against formulas in the student-typed name (src/lib/csv.ts); BOM so Excel reads UTF-8
    const blob = new Blob(["\uFEFF" + buildExamSessionsCsv(sessions)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `exam-${examId}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (loadError && sessions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl pt-12">
        <DataLoadError
          title="Не удалось загрузить ответы студентов"
          message={loadError}
          onRetry={() => setRefreshNonce((current) => current + 1)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/teacher/exams"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ответы студентов</h1>
            {examTitle && <p className="text-slate-500 text-sm mt-0.5">{examTitle}</p>}
          </div>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Скачать CSV
          </button>
        )}
      </div>

      {loadError && (
        <DataLoadError
          compact
          title="Ответы студентов не обновлены"
          message={`${loadError} Показаны последние успешно загруженные данные.`}
          onRetry={() => setRefreshNonce((current) => current + 1)}
        />
      )}

      {/* Stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              icon: <Users className="w-5 h-5 text-blue-600" />,
              bg: "bg-blue-50",
              label: "Всего",
              value: sessions.length,
            },
            {
              icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
              bg: "bg-emerald-50",
              label: "Сдали",
              value: submitted.length,
            },
            {
              icon: <Clock className="w-5 h-5 text-amber-600" />,
              bg: "bg-amber-50",
              label: "В процессе",
              value: inProgress.length,
            },
            {
              icon: <TrendingUp className="w-5 h-5 text-purple-600" />,
              bg: "bg-purple-50",
              label: "Средний %",
              value: `${avgPct.toFixed(0)}%`,
            },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                {s.icon}
              </div>
              <div>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-xl font-bold text-slate-900">{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Никто ещё не начал экзамен</p>
          <p className="text-sm text-slate-400 mt-1">Ответы появятся здесь когда студенты пройдут по ссылке</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 font-medium text-slate-500">Студент</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Вариант</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Результат</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Правильных</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Время</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Статус</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">Сдано</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <motion.tr
                    key={s.session_id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-xs flex-shrink-0">
                          {s.student_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{s.student_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      #{s.variant_number}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.status === "submitted" ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-slate-700 font-medium">
                            {s.score}/{s.max_score}
                          </span>
                          <PercentBadge pct={s.percentage} />
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {s.status === "submitted"
                        ? `${s.correct_count}/${s.total_tasks}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {s.time_spent_seconds > 0
                        ? formatTime(s.time_spent_seconds)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.status === "submitted" ? (
                        <span className="flex items-center justify-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Сдал
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1 text-amber-500 font-medium">
                          <Clock className="w-3.5 h-3.5" /> Проходит
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 text-xs">
                      {formatUtcNaiveAsBusinessTime(s.submitted_at) || "—"}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top 3 */}
          {submitted.length >= 3 && (
            <div className="border-t border-slate-100 px-5 py-4">
              <p className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" /> Топ-3
              </p>
              <div className="flex gap-3">
                {[...submitted]
                  .sort((a, b) => b.percentage - a.percentage)
                  .slice(0, 3)
                  .map((s, idx) => (
                    <div
                      key={s.session_id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="text-lg">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                      </span>
                      <span className="font-medium text-slate-700">{s.student_name}</span>
                      <PercentBadge pct={s.percentage} />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
