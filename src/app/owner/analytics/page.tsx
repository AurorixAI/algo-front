"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  BarChart3, TrendingUp, TrendingDown, Users, 
  GraduationCap, Calendar, Filter, ChevronDown, 
  Target, FileText, ChevronRight, AlertCircle, 
  Award, X, Search, Download, Clock, ShieldAlert,
  Percent,
  Briefcase
} from "lucide-react";

// --- MOCK DATA ---

const mockTeachers = [
  { id: "t1", name: "Анна Смирнова", students: 145, groups: 8, theta: 0.82, trend: "+0.15", status: "top" },
  { id: "t2", name: "Иван Петров", students: 98, groups: 6, theta: 0.65, trend: "+0.05", status: "solid" },
  { id: "t3", name: "Елена Коваль", students: 112, groups: 7, theta: 0.42, trend: "-0.12", status: "risk" },
  { id: "t4", name: "Сергей Иванов", students: 45, groups: 3, theta: 0.55, trend: "0.00", status: "solid" },
];

const mockTeacherGroups = [
  { id: "g1", name: "Алгебра Профи (9 класс)", students: 18, theta: 0.85, trend: "+0.1" },
  { id: "g2", name: "Геометрия База (9 класс)", students: 15, theta: 0.72, trend: "+0.05" },
  { id: "g3", name: "Олимпиада (10 класс)", students: 12, theta: 0.95, trend: "+0.2" },
];

const mockTeacherExams = [
  { id: "e1", name: "Осенний срез (Алгебра 9 кл)", date: "12 Ноя 2026", completion: 95, avgScore: 78, criticalTopics: ["Квадратные корни", "Системы уравнений"] },
  { id: "e2", name: "Диагностика геометрии (10 кл)", date: "05 Ноя 2026", completion: 88, avgScore: 62, criticalTopics: ["Векторы", "Стереометрия"] },
];

const retentionData = [
  { label: "Сентябрь", retained: 98, churned: 2 },
  { label: "Октябрь", retained: 95, churned: 5 },
  { label: "Ноябрь", retained: 89, churned: 11 },
  { label: "Декабрь", retained: 85, churned: 15 },
];

// --- COMPONENTS ---

export default function OwnerAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"academic" | "business">("academic");
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when slide-over is open
  useEffect(() => {
    if (selectedTeacher) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      document.documentElement.style.overflow = "unset";
    };
  }, [selectedTeacher]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "top": return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100"><Award className="w-3.5 h-3.5" /> Топ-результат</span>;
      case "risk": return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium border border-rose-100"><ShieldAlert className="w-3.5 h-3.5" /> Зона риска</span>;
      default: return <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">Стабильно</span>;
    }
  };

  const slideOverContent = (
    <AnimatePresence>
      {selectedTeacher && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTeacher(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Centered Modal Panel */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-3xl max-h-[90vh] bg-slate-50 shadow-2xl z-[110] flex flex-col rounded-[2rem] overflow-hidden border border-slate-200"
          >
            {/* Header */}
            <div className="bg-white px-6 py-6 border-b border-slate-200 flex flex-col gap-6 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-semibold shadow-md shadow-indigo-500/20">
                    {selectedTeacher.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-800">{selectedTeacher.name}</h2>
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-2 mt-1">
                      Преподаватель <span className="w-1 h-1 rounded-full bg-slate-300" /> В штате с 2025 года
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTeacher(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Quick KPI for Teacher */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Учеников</p>
                  <p className="text-2xl font-semibold text-slate-800">{selectedTeacher.students}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Средний θ</p>
                  <p className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
                    {selectedTeacher.theta}
                    <span className={`text-sm font-semibold flex items-center ${selectedTeacher.trend.startsWith('+') ? 'text-emerald-500' : selectedTeacher.trend.startsWith('-') ? 'text-rose-500' : 'text-slate-400'}`}>
                      {selectedTeacher.trend.startsWith('+') ? <TrendingUp className="w-4 h-4" /> : selectedTeacher.trend.startsWith('-') ? <TrendingDown className="w-4 h-4" /> : null}
                      {selectedTeacher.trend}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Groups Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    Группы преподавателя ({selectedTeacher.groups})
                  </h3>
                  <button className="text-sm font-medium text-primary-600 hover:text-primary-700">Все группы</button>
                </div>
                <div className="grid gap-3">
                  {mockTeacherGroups.map(group => (
                    <div key={group.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-indigo-300 transition-colors cursor-pointer group">
                      <div>
                        <h4 className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{group.name}</h4>
                        <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-3">
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {group.students} уч.</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-slate-800 text-lg">{group.theta}</p>
                        <p className={`text-xs font-medium flex items-center justify-end gap-0.5 ${group.trend.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {group.trend.startsWith('+') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {group.trend}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Exams Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-rose-500" />
                    Последние экзамены
                  </h3>
                  <button className="text-sm font-medium text-primary-600 hover:text-primary-700">Отчеты</button>
                </div>
                <div className="space-y-4">
                  {mockTeacherExams.map(exam => (
                    <div key={exam.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                        <div>
                          <h4 className="font-semibold text-slate-800">{exam.name}</h4>
                          <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" /> Проведено: {exam.date}
                          </p>
                        </div>
                        <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-center shadow-sm">
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">Средний балл</p>
                          <p className="text-lg font-bold text-slate-800">{exam.avgScore}%</p>
                        </div>
                      </div>
                      <div className="p-4 bg-white">
                        <div className="mb-3 flex justify-between text-sm">
                          <span className="font-medium text-slate-600">Явка учеников</span>
                          <span className="font-semibold text-slate-800">{exam.completion}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
                          <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${exam.completion}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="space-y-8 w-full max-w-[1600px] mx-auto pb-12">
      {mounted && createPortal(slideOverContent, document.body)}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-semibold tracking-tight text-slate-800"
          >
            Аналитика
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 mt-1 flex items-center gap-2 text-sm font-medium ml-1"
          >
            Центр управления эффективностью
          </motion.p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-100/80 rounded-2xl w-full max-w-md mx-auto sm:mx-0 shadow-inner">
        <button
          onClick={() => setActiveTab("academic")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ${
            activeTab === "academic" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Эффективность Кадров
        </button>
        <button
          onClick={() => setActiveTab("business")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 ${
            activeTab === "business" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Бизнес-показатели
        </button>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {activeTab === "academic" ? (
          <motion.div
            key="academic"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Teacher Performance Matrix */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200/60 overflow-hidden flex flex-col">
              <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-500" />
                    Рейтинг эффективности преподавателей
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Оценка влияния преподавателя на академический рост (θ) учеников.</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-white border-b border-slate-100">
                    <tr>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider">Преподаватель</th>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider text-center">Групп</th>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider text-center">Активных уч.</th>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider text-center">Средний θ</th>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider text-center">Тенденция</th>
                      <th className="p-5 font-medium text-slate-400 text-xs uppercase tracking-wider">Статус</th>
                      <th className="p-5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {mockTeachers.map((teacher) => (
                      <tr 
                        key={teacher.id} 
                        onClick={() => setSelectedTeacher(teacher)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-medium flex items-center justify-center shrink-0">
                              {teacher.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">{teacher.name}</span>
                          </div>
                        </td>
                        <td className="p-5 text-center font-medium text-slate-600">{teacher.groups}</td>
                        <td className="p-5 text-center font-medium text-slate-600">{teacher.students}</td>
                        <td className="p-5 text-center font-mono font-medium text-slate-800 text-lg">{teacher.theta}</td>
                        <td className="p-5 text-center">
                          <div className={`inline-flex items-center gap-1 font-medium text-sm ${teacher.trend.startsWith('+') ? 'text-emerald-500' : teacher.trend.startsWith('-') ? 'text-rose-500' : 'text-slate-400'}`}>
                            {teacher.trend.startsWith('+') ? <TrendingUp className="w-4 h-4" /> : teacher.trend.startsWith('-') ? <TrendingDown className="w-4 h-4" /> : null}
                            {teacher.trend}
                          </div>
                        </td>
                        <td className="p-5">
                          {getStatusBadge(teacher.status)}
                        </td>
                        <td className="p-5 text-right text-slate-300 group-hover:text-primary-600 transition-colors">
                          <ChevronRight className="w-5 h-5 ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="business"
            initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Retention & Churn */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200/60">
                <div className="mb-8 flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                      <Percent className="w-5 h-5 text-emerald-500" />
                      Удержание и Отток (Retention)
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Динамика сохранения клиентов по месяцам.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-semibold text-rose-500">12%</p>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Отток за год</p>
                  </div>
                </div>
                
                <div className="space-y-5">
                  {retentionData.map((data) => (
                    <div key={data.label}>
                      <div className="flex items-center justify-between text-sm font-medium mb-2">
                        <span className="text-slate-700">{data.label}</span>
                        <div className="flex gap-4">
                          <span className="text-emerald-600">{data.retained}% осталось</span>
                          <span className="text-rose-500">-{data.churned}% отток</span>
                        </div>
                      </div>
                      <div className="w-full h-3 flex rounded-full overflow-hidden bg-slate-100">
                        <div className="h-full bg-emerald-400" style={{ width: `${data.retained}%` }} />
                        <div className="h-full bg-rose-400 opacity-80" style={{ width: `${data.churned}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Capacity Utilization */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200/60 flex flex-col">
                <div className="mb-8">
                  <h3 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-500" />
                    Рентабельность и Загрузка
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">Анализ наполняемости групп.</p>
                </div>
                
                <div className="flex items-center justify-center p-8 bg-slate-50 border border-slate-100 rounded-3xl mb-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <div className="text-center z-10">
                    <p className="text-5xl font-bold text-slate-800 mb-2">78%</p>
                    <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">Общая загруженность</p>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <h4 className="font-semibold text-slate-800 mb-2">Убыточные группы (Требуют слияния)</h4>
                  
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">Математика 5 класс (База)</p>
                      <p className="text-xs text-slate-500 mt-1">Преп: Сергей Иванов</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-rose-500">3 <span className="text-sm text-slate-400">/ 15</span></p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase">Учеников</p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">Информатика 11 класс</p>
                      <p className="text-xs text-slate-500 mt-1">Преп: Анна Смирнова</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-rose-500">5 <span className="text-sm text-slate-400">/ 20</span></p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase">Учеников</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
