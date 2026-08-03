"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  TrendingUp,
  AlertTriangle,
  Target,
  BookOpen,
  CheckCircle2,
  XCircle,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { analyticsApi, orgApi } from "@/lib/api";
import { MathRenderer } from "@/components/ui/math-renderer";
import { formatErrorType } from "@/lib/task-display";

import { AssignGroupModal } from "@/components/groups/assign-group-modal";

interface InviteInfo {
  id: string;
  code: string;
  student_name: string;
  student_id?: string;
  class_level: number;
  diagnostic_type: string;
  status: string;
  student_status?: string; // added to track if already active
  completed_at: string | null;
  result?: {
    theta?: number;
    accuracy?: number;
    total_questions?: number;
    correct_answers?: number;
  };
}

export default function DiagnosticReportPage() {
  const params = useParams();
  const router = useRouter();
  const inviteId = params.id as string;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [report, setReport] = useState<any>(null);
  const [skillMap, setSkillMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const invites = await orgApi.listDiagnostics();
        const found = (Array.isArray(invites) ? invites : []).find(
          (i: InviteInfo) => i.id === inviteId,
        );
        if (!found) {
          router.push("/admin/diagnostics");
          return;
        }
        setInvite(found);

        // Always attempt to load report+skill-map if student_id is present.
        // If student_id is null (invite not yet claimed), we still show the
        // invite meta (name, code, class) with a clear "not yet completed" state.
        if (found.student_id) {
          const [rep, sm, studentData] = await Promise.all([
            analyticsApi.studentReport(found.student_id).catch(() => null),
            analyticsApi.studentSkillMap(found.student_id).catch(() => null),
            orgApi.getStudent(found.student_id).catch(() => null),
          ]);
          // studentReport returns {report: null} when no data yet — unwrap it
          const reportData = rep && "report" in rep && rep.report === null ? null : rep;
          setReport(reportData);
          setSkillMap(sm);
          if (studentData) {
            found.student_status = studentData.status;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [inviteId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!invite) return null;

  // ── Pending / not-yet-completed state ──────────────────────────────────────
  // Show invite metadata always; report data shown only when available.
  const hasDiagnosticData = !!report && report.report !== null;
  const isPendingCompletion = !invite.student_id || invite.status !== "completed";

  const theta = report?.overall_theta ?? invite.result?.theta ?? 0;
  const accuracy = report?.accuracy ?? invite.result?.accuracy ?? 0;
  const ci = report?.confidence_interval ?? null;
  const topicBreakdown = report?.topic_breakdown ?? {};
  const weakSkills: string[] = report?.weak_skills ?? [];
  const skillNames: Record<string, string> = report?.skill_names ?? {};
  const distractorErrors = report?.distractor_errors ?? [];
  const itemsTotal = report?.items_total ?? invite.result?.total_questions ?? null;
  const correctCount = invite.result?.correct_answers ?? null;

  // Only show topics that were actually tested (have alpha set explicitly)
  // alpha=undefined means the topic was never visited during this session
  const chartData = Object.entries(topicBreakdown)
    .filter(([, v]: [string, any]) => v.alpha !== undefined && v.alpha !== null)
    .map(([id, v]: [string, any]) => {
      const rawPct =
        v.mastery_pct !== undefined
          ? v.mastery_pct
          : v.mastery !== undefined
          ? v.mastery * 100
          : (0.5 + (v.alpha ?? 0) / 4.0) * 100;
      return {
        name: v.name_ru ?? v.name ?? id,
        mastery: Math.round(Math.max(0, Math.min(100, rawPct))),
        id,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));


  const levelLabel =
    theta >= 1 ? "Выше программы" : theta >= -0.5 ? "Соответствует программе" : "Ниже программы";

  return (
    <div className="space-y-6 w-full max-w-[1400px] mx-auto">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/diagnostics"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Отчёт диагностики</h1>
          <p className="text-slate-500 text-sm">
            {invite.student_name} · {invite.class_level} класс · код {invite.code}
          </p>
        </div>
        
        {/* Assign Button */}
        {invite.status === "completed" && invite.student_id && (
          <button
            onClick={() => setAssignModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-xl hover:from-primary-700 hover:to-indigo-700 transition-colors font-medium shadow-md shadow-primary-600/20"
          >
            <Users className="w-4 h-4" />
            Определить в группу
          </button>
        )}
      </div>

      <AssignGroupModal
        open={assignModalOpen}
        studentId={invite.student_id || ""}
        studentName={invite.student_name}
        onClose={() => setAssignModalOpen(false)}
        onAssigned={() => {
          setAssignModalOpen(false);
          setInvite({ ...invite, student_status: "active" });
          alert("Ученик успешно зачислен в группу!");
        }}
      />

      {/* Empty state — invite exists but diagnostic not completed yet */}
      {isPendingCompletion && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
          <XCircle className="w-10 h-10 text-slate-300" />
          <p className="text-slate-600 font-medium">Диагностика ещё не пройдена</p>
          <p className="text-sm text-slate-400">
            Ученик <span className="font-semibold">{invite.student_name}</span> ещё не завершил тест
            по ссылке с кодом <span className="font-mono font-semibold">{invite.code}</span>.
          </p>
        </div>
      )}

      {/* Report not yet generated — student completed but Gemini hasn't run */}
      {!isPendingCompletion && !hasDiagnosticData && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 bg-amber-50 rounded-2xl border border-amber-100 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
          <p className="text-amber-800 font-medium">Отчёт ещё не сгенерирован</p>
          <p className="text-sm text-amber-600">
            Диагностика завершена, но аналитический отчёт ещё формируется. Обновите страницу через минуту.
          </p>
        </div>
      )}

      {/* KPI cards — only when report data is available */}
      {!isPendingCompletion && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "Theta (θ)", value: theta.toFixed(2), icon: Brain, color: "text-primary-600" },
          { label: "Уровень", value: levelLabel, icon: TrendingUp, color: "text-emerald-600" },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-slate-100 p-4"
          >
            <kpi.icon className={`w-5 h-5 mb-2 ${kpi.color}`} />
            <p className="text-xs text-slate-500">{kpi.label}</p>
            <p className="text-lg font-bold text-slate-900">{kpi.value}</p>
          </motion.div>
        ))}
      </div>
      )}


      {!isPendingCompletion && ci && (
      <p className="text-xs text-slate-400">
        Доверительный интервал θ: [{ci[0]?.toFixed(2)};{" "}{ci[1]?.toFixed(2)}]
      </p>
      )}

      {/* Topic mastery — executive progress card list (zero text truncation) */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary-600" />
                Мастерство по темам
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Охвачено тем: {chartData.length} из {Object.keys(topicBreakdown).length}
              </p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 self-start sm:self-auto">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />≥75% освоено</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />50–74% частично</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" />&lt;50% пробел</span>
            </div>
          </div>

          <div className="space-y-3">
            {chartData.map((t) => {
              const statusCfg =
                t.mastery >= 75
                  ? { label: "Освоено", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "from-emerald-500 to-teal-500" }
                  : t.mastery >= 50
                  ? { label: "Частично", bg: "bg-amber-50 text-amber-700 border-amber-200", bar: "from-amber-500 to-orange-500" }
                  : { label: "Пробел", bg: "bg-red-50 text-red-700 border-red-200", bar: "from-red-500 to-rose-500" };

              return (
                <div key={t.id} className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="font-semibold text-slate-900 text-sm leading-snug break-words flex-1">
                      {t.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${statusCfg.bg}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">
                        {t.mastery}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${t.mastery}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full bg-gradient-to-r ${statusCfg.bar}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weak skills */}
      {weakSkills.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
          <h2 className="text-lg font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Слабые навыки
          </h2>
          <ul className="space-y-2">
            {weakSkills.map((sk) => (
              <li key={sk} className="flex items-center gap-2 text-amber-800">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {skillNames[sk] ?? sk}
              </li>
            ))}
          </ul>
          {report?.recommended_start && (
            <p className="mt-4 text-sm text-amber-700">
              Рекомендуем начать с:{" "}
              <strong>{skillNames[report.recommended_start] ?? report.recommended_start}</strong>
            </p>
          )}
        </div>
      )}

      {/* Narrative */}
      {report?.narrative_ru && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Заключение</h2>
          <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-line leading-relaxed">
            {report.narrative_ru}
          </div>
        </div>
      )}

      {/* Distractor errors */}
      {distractorErrors.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Типичные ошибки</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="pb-2 pr-4">Задача</th>
                  <th className="pb-2 pr-4">Ответ ученика</th>
                  <th className="pb-2 pr-4">Тип ошибки</th>
                  <th className="pb-2">Пояснение</th>
                </tr>
              </thead>
              <tbody>
                {distractorErrors.map((err: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-mono text-xs">{err.task_id}</td>
                    <td className="py-3 pr-4">
                      <MathRenderer text={err.student_answer} />
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs">
                        {formatErrorType(err.error_type)}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600">{err.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Skill map list from API */}
      {skillMap?.skills?.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-lg font-semibold mb-1">Карта навыков</h2>
          <p className="text-xs text-slate-400 mb-4">Результаты по каждому протестированному навыку</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skillMap.skills.map((s: any) => {
              const masteryVal =
                s.mastery !== undefined
                  ? s.mastery
                  : s.mastery_pct !== undefined
                  ? s.mastery_pct / 100
                  : 0;
              const pct = Math.round(Math.max(0, Math.min(100, masteryVal * 100)));
              const levelCfg =
                s.level === "strong" || pct >= 75
                  ? { label: "Освоено", cls: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" }
                  : s.level === "medium" || pct >= 50
                  ? { label: "Частично", cls: "bg-amber-100 text-amber-700", bar: "bg-amber-500" }
                  : { label: "Пробел", cls: "bg-red-100 text-red-700", bar: "bg-red-500" };
              return (
                <div
                  key={s.skill_id || s.name}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 gap-3 border border-slate-100"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 leading-snug break-words">
                      {s.skill_name || s.name || s.skill_id}
                    </p>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 w-full bg-slate-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${levelCfg.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${levelCfg.cls}`}>
                    {pct}% · {levelCfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty skill map state — data not yet available */}
      {(!skillMap || !skillMap.skills?.length) && !isPendingCompletion && hasDiagnosticData && (
        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
          <p className="text-sm text-slate-500">Детальная карта навыков будет доступна после обработки данных</p>
        </div>
      )}
    </div>
  );
}
