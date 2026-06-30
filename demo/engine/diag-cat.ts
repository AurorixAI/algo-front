import type { DemoTask, DiagSessionState } from "../types";
import { checkAnswer, thetaToLevel, buildMcOptions } from "./grader";
import { pickTaskDisplayText } from "./task-display";
import { getTasksForClass } from "./state";

const WARMUP_COUNT = 3;
const MAX_ITEMS = 17;
const MIN_SE = 0.3;

function pickTask(
  pool: DemoTask[],
  used: Set<string>,
  difficulty?: "A" | "B" | "C",
  skillId?: string,
): DemoTask | null {
  let candidates = pool.filter((t) => !used.has(t.task_id));
  if (difficulty) candidates = candidates.filter((t) => t.difficulty === difficulty);
  if (skillId) {
    const bySkill = candidates.filter((t) => t.skill_id === skillId);
    if (bySkill.length) candidates = bySkill;
  }
  if (!candidates.length) {
    candidates = pool.filter((t) => !used.has(t.task_id));
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function createDiagSession(
  sessionId: string,
  studentId: string,
  gradeLevel: number,
  inviteCode?: string,
): DiagSessionState {
  const pool = getTasksForClass(gradeLevel);
  const first = pickTask(pool, new Set(), "A") ?? pool[0];
  return {
    session_id: sessionId,
    student_id: studentId,
    grade_level: gradeLevel,
    invite_code: inviteCode,
    theta: 0,
    se: 1.0,
    phase: "warmup",
    items_answered: 0,
    items_max: MAX_ITEMS,
    correct_count: 0,
    used_task_ids: first ? [first.task_id] : [],
    weak_skills: [],
    deep_scan_remaining: 0,
    answers: [],
    completed: false,
  };
}

export function getFirstTask(session: DiagSessionState): DemoTask | null {
  const pool = getTasksForClass(session.grade_level);
  const id = session.used_task_ids[0];
  return pool.find((t) => t.task_id === id) ?? null;
}

function nextPhase(session: DiagSessionState): "warmup" | "navigation" | "deep_scan" {
  if (session.items_answered < WARMUP_COUNT) return "warmup";
  if (session.deep_scan_remaining > 0) return "deep_scan";
  return "navigation";
}

function selectNextTask(session: DiagSessionState, lastCorrect: boolean): DemoTask | null {
  const pool = getTasksForClass(session.grade_level);
  const used = new Set(session.used_task_ids);
  const phase = nextPhase(session);

  if (phase === "warmup") {
    return pickTask(pool, used, "A");
  }
  if (phase === "deep_scan" && session.weak_skills.length) {
    const skill = session.weak_skills[session.weak_skills.length - 1];
    return pickTask(pool, used, "A", skill) ?? pickTask(pool, used, "A");
  }
  if (lastCorrect) {
    const diff = session.theta > 0.5 ? "C" : session.theta > -0.2 ? "B" : "A";
    return pickTask(pool, used, diff as "A" | "B" | "C");
  }
  const weak = session.weak_skills[session.weak_skills.length - 1];
  return pickTask(pool, used, "A", weak) ?? pickTask(pool, used, "A");
}

export function taskToDiagOut(task: DemoTask, session: DiagSessionState) {
  const phase = nextPhase(session);
  const display = pickTaskDisplayText(task);
  return {
    task_id: task.task_id,
    skill_id: task.skill_id,
    topic_id: task.topic_id,
    question_text: display,
    question_latex: display,
    question_image_url: null,
    answer_type: task.answer_type,
    answer_options: buildMcOptions(task),
    hints: null,
    phase,
    items_answered: session.items_answered,
    items_max: session.items_max,
    is_deep_scan: phase === "deep_scan",
  };
}

export function submitDiagAnswer(
  session: DiagSessionState,
  task: DemoTask,
  studentAnswer: string,
  timeMs?: number,
) {
  const result = checkAnswer(task, studentAnswer);
  session.answers.push({
    task_id: task.task_id,
    student_answer: studentAnswer,
    is_correct: result.is_correct,
    eval_category: result.eval_category,
    distractor_hit: result.distractor_hit,
    time_ms: timeMs,
  });

  if (result.is_correct) {
    session.theta += 0.35;
    session.correct_count += 1;
  } else {
    session.theta -= 0.45;
    if (!session.weak_skills.includes(task.skill_id)) {
      session.weak_skills.push(task.skill_id);
    }
    if (result.eval_category === "distractor" && session.deep_scan_remaining < 2) {
      session.deep_scan_remaining += 2;
    }
  }

  session.se = Math.max(MIN_SE, session.se * 0.88);
  session.items_answered += 1;
  if (session.deep_scan_remaining > 0 && nextPhase(session) === "deep_scan") {
    session.deep_scan_remaining -= 1;
  }

  const shouldComplete =
    session.items_answered >= session.items_max || session.se <= MIN_SE;

  if (shouldComplete) {
    session.completed = true;
    return {
      is_correct: result.is_correct,
      outcome: result.is_correct ? 1.0 : result.eval_category === "distractor" ? 0.5 : 0.0,
      eval_category: result.eval_category,
      theta: session.theta,
      se: session.se,
      next_task: null,
      session_completed: true,
    };
  }

  const next = selectNextTask(session, result.is_correct);
  if (!next) {
    session.completed = true;
    return {
      is_correct: result.is_correct,
      outcome: result.is_correct ? 1.0 : 0.0,
      eval_category: result.eval_category,
      theta: session.theta,
      se: session.se,
      next_task: null,
      session_completed: true,
    };
  }

  session.used_task_ids.push(next.task_id);
  session.phase = nextPhase(session);

  return {
    is_correct: result.is_correct,
    outcome: result.is_correct ? 1.0 : result.eval_category === "distractor" ? 0.5 : 0.0,
    eval_category: result.eval_category,
    theta: session.theta,
    se: session.se,
    next_task: taskToDiagOut(next, session),
    session_completed: false,
  };
}

export function buildDiagReport(session: DiagSessionState) {
  const pool = getTasksForClass(session.grade_level);
  const topicBreakdown: Record<string, { alpha: number; level: string }> = {};
  const skillHits: Record<string, { correct: number; total: number }> = {};

  for (const ans of session.answers) {
    const task = pool.find((t) => t.task_id === ans.task_id);
    if (!task) continue;
    const topic = task.topic_id;
    if (!skillHits[task.skill_id]) skillHits[task.skill_id] = { correct: 0, total: 0 };
    skillHits[task.skill_id].total += 1;
    if (ans.is_correct) skillHits[task.skill_id].correct += 1;
    if (!topicBreakdown[topic]) {
      const ratio = ans.is_correct ? 0.7 : 0.3;
      topicBreakdown[topic] = { alpha: ratio, level: thetaToLevel(ratio * 2 - 1) };
    }
  }

  for (const [topic, data] of Object.entries(topicBreakdown)) {
    const hits = session.answers.filter((a) => {
      const t = pool.find((x) => x.task_id === a.task_id);
      return t?.topic_id === topic;
    });
    const acc = hits.length ? hits.filter((h) => h.is_correct).length / hits.length : 0.5;
    data.alpha = acc;
    data.level = thetaToLevel(acc * 2 - 1);
    void topic;
  }

  const weakSkills = Object.entries(skillHits)
    .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.5)
    .map(([id]) => id);

  const ciLo = session.theta - 1.96 * session.se;
  const ciHi = session.theta + 1.96 * session.se;

  return {
    session_id: session.session_id,
    student_id: session.student_id,
    grade_level: session.grade_level,
    overall_theta: session.theta,
    overall_level: thetaToLevel(session.theta),
    confidence_interval: [ciLo, ciHi] as [number, number],
    topic_breakdown: topicBreakdown,
    weak_skills: weakSkills.length ? weakSkills : session.weak_skills.slice(0, 3),
    recommended_start: weakSkills[0] ?? session.weak_skills[0] ?? null,
    items_total: session.items_answered,
    accuracy: session.items_answered
      ? session.correct_count / session.items_answered
      : 0,
    answers: session.answers,
  };
}
