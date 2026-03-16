"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { FileText, Plus, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { examsApi } from "@/lib/api";

export default function TeacherExamsPage() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await examsApi.list();
        setExams(Array.isArray(data) ? data : []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  const statusIcon = (s: string) => {
    switch (s) {
      case "ready": case "generated": return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "generating": return <Clock className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Экзамены</h1>
          <p className="text-slate-500 mt-1">{exams.length} экзаменов</p>
        </div>
        <Link href="/teacher/exams/new" className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700">
          <Plus className="w-4 h-4" /> Создать экзамен
        </Link>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">Нет созданных экзаменов</p>
          <p className="text-sm text-slate-400 mt-1">Нажмите «Создать экзамен» чтобы сгенерировать вариант</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map((ex, i) => (
            <motion.div key={ex.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FileText className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">{ex.title || ex.name || `Экзамен #${ex.id}`}</h3>
                  <p className="text-sm text-slate-500">
                    {ex.class_level && `${ex.class_level} класс · `}
                    {ex.question_count && `${ex.question_count} вопросов · `}
                    {ex.created_at && new Date(ex.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {statusIcon(ex.status)}
                {ex.download_url && (
                  <a href={ex.download_url} className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-sm hover:bg-primary-100">Скачать</a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
