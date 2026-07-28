"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Copy,
  Check,
} from "lucide-react";
import { examsApi, type ExamSummary } from "@/lib/api";
import { FeatureLock } from "@/components/ui/feature-lock";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft: {
    label: "Черновик",
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-amber-500",
  },
  variants_ready: {
    label: "Варианты готовы",
    icon: <Clock className="w-4 h-4" />,
    color: "text-blue-500",
  },
  active: {
    label: "Активен",
    icon: <CheckCircle className="w-4 h-4" />,
    color: "text-emerald-500",
  },
  closed: {
    label: "Закрыт",
    icon: <XCircle className="w-4 h-4" />,
    color: "text-slate-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-slate-400",
  };
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function TeacherExamsPage() {
  const pathname = usePathname();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadExams = useCallback(() => {
    setLoading(true);
    examsApi
      .list()
      .then((data) => setExams(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (pathname !== "/teacher/exams") return;
    loadExams();
  }, [pathname, loadExams]);

  const handleCopyCode = (exam: ExamSummary) => {
    if (!exam.access_code) return;
    navigator.clipboard.writeText(`https://algo.uz/e/${exam.access_code}`);
    setCopiedId(exam.exam_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <FeatureLock
      title="Экзамены"
      description="Модуль откроется после завершения 1-2 этапа подключения центра."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Экзамены</h1>
            <p className="text-slate-500 mt-1">{exams.length} экзаменов</p>
          </div>
          <Link
            href="/teacher/exams/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Создать экзамен
          </Link>
        </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Нет созданных экзаменов</p>
          <p className="text-sm text-slate-400 mt-1">
            Нажмите «Создать экзамен» чтобы сгенерировать вариант
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((ex, i) => (
            <motion.div
              key={ex.exam_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{ex.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {ex.tasks_per_variant} вопросов
                      {ex.variants_count > 1 && ` · ${ex.variants_count} вариантов`}
                      {" · "}
                      {new Date(ex.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={ex.status} />

                  {ex.access_code && ex.status === "active" && (
                    <button
                      onClick={() => handleCopyCode(ex)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm transition-colors"
                      title={`Копировать ссылку: algo.uz/e/${ex.access_code}`}
                    >
                      {copiedId === ex.exam_id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="font-mono">{ex.access_code}</span>
                    </button>
                  )}

                  {ex.status === "active" && (
                    <Link
                      href={`/teacher/exams/${ex.exam_id}/sessions`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Ответы
                    </Link>
                  )}

                  <Link
                    href={`/teacher/exams/${ex.exam_id}/draft`}
                    className="px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 text-sm font-medium transition-colors"
                  >
                    {ex.status === "draft" ? "Редактировать" : "Просмотр"}
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
    </FeatureLock>
  );
}

