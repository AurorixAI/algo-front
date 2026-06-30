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

        if (found.student_id) {
          const [rep, sm, studentData] = await Promise.all([
            analyticsApi.studentReport(found.student_id).catch(() => null),
            analyticsApi.studentSkillMap(found.student_id).catch(() => null),
            orgApi.getStudent(found.student_id).catch(() => null),
          ]);
          setReport(rep);
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

  const theta = report?.overall_theta ?? invite.result?.theta ?? 0;
  const accuracy = report?.accuracy ?? invite.result?.accuracy ?? 0;
  const ci = report?.confidence_interval ?? [-0.5, 0.5];
  const topicBreakdown = report?.topic_breakdown ?? {};
  const weakSkills: string[] = report?.weak_skills ?? [];
  const skillNames: Record<string, string> = report?.skill_names ?? {};
  const distractorErrors = report?.distractor_errors ?? [];

  const chartData = Object.entries(topicBreakdown).map(([id, v]: [string, any]) => ({
    name: (v.name ?? id).slice(0, 20),
    mastery: Math.round((v.alpha ?? 0.5) * 100),
    id,
  }));

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

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Theta (θ)", value: theta.toFixed(2), icon: Brain, color: "text-primary-600" },
          { label: "Уровень", value: levelLabel, icon: TrendingUp, color: "text-emerald-600" },
          {
            label: "Точность",
            value: `${Math.round(accuracy * 100)}%`,
            icon: Target,
            color: "text-blue-600",
          },
          {
            label: "Вопросов",
            value: `${invite.result?.correct_answers ?? "—"}/${invite.result?.total_questions ?? report?.items_total ?? "—"}`,
            icon: CheckCircle2,
            color: "text-violet-600",
          },
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

      <p className="text-xs text-slate-400">
        Доверительный интервал θ: [{ci[0]?.toFixed(2)}, {ci[1]?.toFixed(2)}]
      </p>

      {/* Skill map chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-600" />
            Мастерство по темам
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Мастерство"]} />
                <Bar dataKey="mastery" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={entry.id}
                      fill={entry.mastery >= 75 ? "#10b981" : entry.mastery >= 50 ? "#f59e0b" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
          <h2 className="text-lg font-semibold mb-4">Карта навыков</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skillMap.skills.map((s: any) => (
              <div
                key={s.skill_id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
              >
                <span className="text-sm font-medium">{s.skill_name}</span>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full ${
                    s.level === "strong"
                      ? "bg-emerald-100 text-emerald-700"
                      : s.level === "medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {Math.round((s.mastery ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
