import type { DemoRequest, DemoResponse } from "../types";
import {
  demoState,
  initDemoState,
  getTaskById,
  getTasksForClass,
} from "../engine/state";
import {
  createDiagSession,
  getFirstTask,
  taskToDiagOut,
  submitDiagAnswer,
  buildDiagReport,
} from "../engine/diag-cat";
import { thetaToLevelRu } from "../engine/grader";
import reportSeed from "../fixtures/diagnostics/report_stu-demo-002.json";

function buildNarrative(session: import("../types").DiagSessionState, report: Record<string, unknown>): string {
  const acc = Math.round((report.accuracy as number) * 100);
  const weak = (report.weak_skills as string[]) ?? [];
  const pool = getTasksForClass(session.grade_level);
  const weakNames = weak.map((s) => pool.find((t) => t.skill_id === s)?.skill_name ?? s).join(", ");
  return `Ученик прошёл ${report.items_total} вопросов с точностью ${acc}%. Уровень подготовки: ${thetaToLevelRu(report.overall_theta as number)}.\n\n${
    weak.length
      ? `Выявлены пробелы в навыках: ${weakNames}. Рекомендуется целенаправленная работа над этими темами в течение 2–3 недель.`
      : "Существенных пробелов не выявлено. Рекомендуется переход к задачам повышенной сложности."
  }\n\nПрогноз: при регулярных занятиях ожидается рост показателя θ на 0.3–0.5 за месяц.`;
}

function json(status: number, body: unknown): DemoResponse {
  return { status, body };
}

export function handleDiagnostic(req: DemoRequest): DemoResponse | null {
  initDemoState();
  const { method, path, body } = req;

  if (method === "POST" && path === "/diagnostic/sessions") {
    const b = body as { student_id: string; grade_level: number; invite_code?: string };
    const sessionId = `diag-sess-${Date.now()}`;
    const session = createDiagSession(sessionId, b.student_id, b.grade_level, b.invite_code);
    demoState.diagSessions.set(sessionId, session);

    if (b.invite_code) {
      const inv = demoState.invites.find((i) => i.code.toUpperCase() === b.invite_code!.toUpperCase());
      if (inv) {
        inv.status = "in_progress";
        inv.started_at = new Date().toISOString();
        inv.cat_session_id = sessionId;
      }
    }

    const first = getFirstTask(session);
    if (!first) return json(500, { detail: "No tasks" });

    return json(201, {
      session_id: sessionId,
      first_task: taskToDiagOut(first, session),
    });
  }

  const answerMatch = path.match(/^\/diagnostic\/sessions\/([^/]+)\/answer$/);
  if (method === "POST" && answerMatch) {
    const sessionId = answerMatch[1];
    const session = demoState.diagSessions.get(sessionId);
    if (!session) return json(404, { detail: "Сессия не найдена" });
    if (session.completed) return json(400, { detail: "Сессия завершена" });

    const b = body as { task_id: string; student_answer: string; time_ms?: number };
    const task = getTaskById(b.task_id);
    if (!task) return json(400, { detail: "Задача не найдена" });

    const result = submitDiagAnswer(session, task, b.student_answer, b.time_ms);

    if (result.session_completed) {
      const report = buildDiagReport(session);
      const pool = getTasksForClass(session.grade_level);
      const skillNames: Record<string, string> = {};
      for (const sk of (report.weak_skills as string[]) ?? []) {
        const t = pool.find((x) => x.skill_id === sk);
        if (t) skillNames[sk] = t.skill_name;
      }
      const fullReport = {
        ...report,
        skill_names: skillNames,
        narrative_ru: buildNarrative(session, report),
        distractor_errors: session.answers
          .filter((a) => a.distractor_hit)
          .map((a) => ({
            task_id: a.task_id,
            student_answer: a.student_answer,
            error_type: a.distractor_hit!.error_type,
            explanation: a.distractor_hit!.explanation,
          })),
      };
      demoState.diagReports.set(sessionId, fullReport);

      if (session.invite_code) {
        const inv = demoState.invites.find((i) => i.code.toUpperCase() === session.invite_code!.toUpperCase());
        if (inv) {
          inv.status = "completed";
          inv.completed_at = new Date().toISOString();
          inv.result = {
            theta: report.overall_theta as number,
            accuracy: report.accuracy as number,
            recommended_level: report.overall_level as string,
            total_questions: report.items_total as number,
            correct_answers: session.correct_count,
          };
        }
      }
    }

    return json(200, result);
  }

  const reportMatch = path.match(/^\/diagnostic\/sessions\/([^/]+)\/report$/);
  if (method === "GET" && reportMatch) {
    const sessionId = reportMatch[1];
    let report = demoState.diagReports.get(sessionId);
    if (!report && sessionId === "diag-sess-seed-003") {
      report = reportSeed as Record<string, unknown>;
    }
    const session = demoState.diagSessions.get(sessionId);
    if (!report && session?.completed) {
      report = buildDiagReport(session);
    }
    if (!report) return json(404, { detail: "Отчёт не найден" });
    const { answers, accuracy, ...publicReport } = report as Record<string, unknown>;
    void answers;
    void accuracy;
    return json(200, publicReport);
  }

  return null;
}

export function handleAnalytics(req: DemoRequest): DemoResponse | null {
  initDemoState();
  const { method, path } = req;

  const reportMatch = path.match(/^\/analytics\/students\/([^/]+)\/report$/);
  if (method === "GET" && reportMatch) {
    const studentId = reportMatch[1];
    let report = demoState.diagReports.get(
      demoState.invites.find((i) => i.student_id === studentId)?.cat_session_id ?? "",
    );
    if (!report && studentId === "stu-demo-002") {
      const seed = reportSeed as Record<string, unknown>;
      return json(200, {
        grade_level: seed.grade_level,
        overall_level: thetaToLevelRu(seed.overall_theta as number),
        weak_topics: (seed.weak_skills as string[]).map(
          (s) => (seed.skill_names as Record<string, string>)?.[s] ?? s,
        ),
        narrative_ru: seed.narrative_ru,
        generated_at: new Date().toISOString(),
        ...seed,
      });
    }
    if (!report) return json(200, { report: null });
    return json(200, {
      grade_level: report.grade_level,
      overall_level: thetaToLevelRu(report.overall_theta as number),
      weak_topics: (report.weak_skills as string[]) ?? [],
      narrative_ru: "Диагностика завершена. Рекомендуется работа над слабыми навыками.",
      generated_at: new Date().toISOString(),
      ...report,
    });
  }

  const skillMapMatch = path.match(/^\/analytics\/students\/([^/]+)\/skill-map$/);
  if (method === "GET" && skillMapMatch) {
    const studentId = skillMapMatch[1];
    if (studentId === "stu-demo-002") {
      const seed = reportSeed as Record<string, unknown>;
      const breakdown = seed.topic_breakdown as Record<string, { alpha: number; name: string }>;
      return json(200, {
        skills: Object.entries(breakdown).map(([id, v]) => ({
          skill_id: id,
          skill_name: v.name,
          mastery: v.alpha,
          level: v.alpha >= 0.75 ? "strong" : v.alpha >= 0.5 ? "medium" : "weak",
        })),
      });
    }
    return json(200, { skills: [] });
  }

  if (method === "GET" && path === "/analytics/org/stats") {
    return json(200, { students_total: demoState.students.length, diagnostics_completed: demoState.invites.filter((i) => i.status === "completed").length });
  }

  if (method === "GET" && path === "/analytics/org/overview") {
    return json(200, { org_name: "Школа «Алго» (Демо)", active_students: 3, diagnostics_today: 1 });
  }

  if (method === "GET" && path.startsWith("/analytics/org/enrollment")) {
    return json(200, [{ date: "2026-06-01", count: 2 }, { date: "2026-06-05", count: 1 }]);
  }

  if (method === "GET" && path === "/analytics/org/problem-skills") {
    return json(200, { problem_skills: [{ skill_id: "G8_ALG_23", skill_name: "Квадратные уравнения", error_rate: 0.42 }] });
  }

  if (method === "GET" && path === "/analytics/org/live-queue") {
    return json(200, { active: demoState.invites.filter((i) => i.status === "in_progress").length });
  }

  return null;
}
