import type { DemoRequest, DemoResponse } from "../types";
import type { ExamDraft, ExamDraftTask, ExamSession } from "../types";
import class5Books from "../fixtures/textbooks/class5.json";
import class6Books from "../fixtures/textbooks/class6.json";
import class7Books from "../fixtures/textbooks/class7.json";
import class8Books from "../fixtures/textbooks/class8.json";
import {
  demoState,
  initDemoState,
  nextSessionId,
  generateAccessCode,
  getTaskById,
} from "../engine/state";
import { generateExam, getAlternativesForTask } from "../engine/exam-generator";
import { checkAnswer, buildMcOptions, shuffle } from "../engine/grader";
import { pickTaskDisplayText } from "../engine/task-display";

const ALL_BOOKS = [...class5Books, ...class6Books, ...class7Books, ...class8Books] as Array<{
  textbook_id: string;
  class_level: number;
}>;

function resolveClassLevel(b: {
  textbook_id?: string;
  skill_ids?: string[];
}): number {
  if (b.textbook_id) {
    const book = ALL_BOOKS.find((x) => x.textbook_id === b.textbook_id);
    if (book) return book.class_level;
  }
  if (b.skill_ids?.length) {
    const m = b.skill_ids[0].match(/^G(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return 8;
}

function json(status: number, body: unknown): DemoResponse {
  return { status, body };
}

function shouldShowMc(task: ExamDraftTask, mcMode = "auto"): boolean {
  const hasOpts = (task.answer_options?.length ?? 0) >= 2 || (task.distractor_meta?.length ?? 0) > 0;
  if (mcMode === "all_open") return false;
  if (!hasOpts) return false;
  if (mcMode === "all_mc") return true;
  const mcTypes = new Set(["exact_number", "decimal", "fraction", "multiple_choice", "true_false", "equation_solution"]);
  return mcTypes.has(task.answer_type) && ["A", "B"].includes(task.difficulty);
}

function taskToStudentTask(task: ExamDraftTask, mcMode: string) {
  const showMc = shouldShowMc(task, mcMode);
  let options: string[] = [];
  if (showMc) {
    options = shuffle(
      buildMcOptions({
        task_id: task.task_id,
        skill_id: task.skill_id,
        skill_name: task.skill_name,
        topic_id: "",
        class_level: 8,
        difficulty: task.difficulty as "A" | "B" | "C",
        question_text: task.question_text,
        question_latex: task.question_latex,
        answer_type: task.answer_type,
        correct_answer: task.correct_answer,
        answer_options: task.answer_options ?? [],
        distractor_meta: task.distractor_meta ?? [],
      }),
    );
  }
  return {
    task_id: task.task_id,
    skill_id: task.skill_id,
    skill_name: task.skill_name,
    difficulty: task.difficulty,
    text: pickTaskDisplayText(task),
    options,
    image_url: task.question_image_url,
    answer_type: showMc ? "multiple_choice" : task.answer_type,
    points: 10,
  };
}

function getExamByIdOrCode(idOrCode: string): ExamDraft | undefined {
  for (const exam of demoState.exams.values()) {
    if (exam.exam_id === idOrCode) return exam;
    if (exam.access_code?.toUpperCase() === idOrCode.toUpperCase()) return exam;
  }
  return undefined;
}

export function handleExam(req: DemoRequest): DemoResponse | null {
  initDemoState();
  const { method, path, body } = req;

  if (method === "POST" && path === "/exams/generate") {
    const b = body as {
      title: string;
      textbook_id?: string;
      skill_ids?: string[];
      paragraph_ids?: number[];
      tasks_count?: number;
      time_minutes?: number;
      variants_count?: number;
      shuffle_tasks?: boolean;
      mc_mode?: string;
    };
    const classLevel = resolveClassLevel(b);
    const exam = generateExam({ ...b, class_level: classLevel });
    demoState.exams.set(exam.exam_id, exam);
    return json(200, {
      exam_id: exam.exam_id,
      status: exam.status,
      tasks_count: exam.tasks_per_variant,
      variants_count: exam.variants_count,
      skills_covered: exam.skills_covered,
    });
  }

  if (method === "GET" && path === "/exams") {
    const list = Array.from(demoState.exams.values()).map((e) => ({
      exam_id: e.exam_id,
      title: e.title,
      status: e.status,
      access_code: e.access_code,
      tasks_per_variant: e.tasks_per_variant,
      variants_count: e.variants_count,
      sessions_count: Array.from(demoState.examSessions.values()).filter((s) => s.exam_id === e.exam_id).length,
      created_at: e.created_at,
    }));
    return json(200, list);
  }

  const draftMatch = path.match(/^\/exams\/([^/]+)\/draft$/);
  if (method === "GET" && draftMatch) {
    const exam = getExamByIdOrCode(draftMatch[1]);
    if (!exam) return json(404, { detail: "Экзамен не найден" });
    return json(200, exam);
  }

  const altMatch = path.match(/^\/exams\/([^/]+)\/draft\/alternatives$/);
  if (method === "GET" && altMatch) {
    const exam = getExamByIdOrCode(altMatch[1]);
    if (!exam) return json(404, { detail: "Не найден" });
    const variantNumber = parseInt(req.searchParams.get("variant_number") || "1", 10);
    const taskId = req.searchParams.get("task_id") || "";
    const classLevel = (exam.settings.class_level as number) ?? 8;
    const alts = getAlternativesForTask(exam, taskId, classLevel);
    return json(200, alts.map((t) => ({
      task_id: t.task_id,
      question_text: t.question_text,
      question_latex: t.question_latex,
      difficulty: t.difficulty,
      correct_answer: t.correct_answer,
      answer_type: t.answer_type,
    })));
  }

  const replaceMatch = path.match(/^\/exams\/([^/]+)\/draft\/replace-task$/);
  if (method === "POST" && replaceMatch) {
    const exam = getExamByIdOrCode(replaceMatch[1]);
    if (!exam) return json(404, { detail: "Не найден" });
    const b = body as { variant_number: number; task_id: string };
    const variant = exam.variants.find((v) => v.variant_number === b.variant_number);
    if (!variant) return json(404, { detail: "Вариант не найден" });
    const classLevel = (exam.settings.class_level as number) ?? 8;
    const alts = getAlternativesForTask(exam, b.task_id, classLevel);
    if (!alts.length) return json(400, { detail: "Нет альтернатив" });
    const newTask = alts[Math.floor(Math.random() * alts.length)];
    const idx = variant.tasks.findIndex((t) => t.task_id === b.task_id);
    if (idx >= 0) variant.tasks[idx] = newTask;
    return json(200, { status: "replaced", new_task: newTask });
  }

  const publishMatch = path.match(/^\/exams\/([^/]+)\/publish$/);
  if (method === "POST" && publishMatch) {
    const exam = getExamByIdOrCode(publishMatch[1]);
    if (!exam) return json(404, { detail: "Не найден" });
    if (exam.status === "active") return json(400, { detail: "Уже опубликован" });
    exam.status = "active";
    exam.access_code = generateAccessCode();
    return json(200, {
      exam_id: exam.exam_id,
      title: exam.title,
      status: "active",
      access_code: exam.access_code,
      tasks_per_variant: exam.tasks_per_variant,
      variants_count: exam.variants_count,
      created_at: exam.created_at,
      url: `/e/${exam.access_code}`,
    });
  }

  const sessionsMatch = path.match(/^\/exams\/([^/]+)\/sessions$/);
  if (method === "GET" && sessionsMatch) {
    const exam = getExamByIdOrCode(sessionsMatch[1]);
    if (!exam) return json(404, { detail: "Не найден" });
    const sessions = Array.from(demoState.examSessions.values())
      .filter((s) => s.exam_id === exam.exam_id)
      .map((s) => ({
        session_id: s.session_id,
        student_name: s.student_name,
        variant_number: s.variant_number,
        status: s.status,
        score: s.score,
        max_score: s.max_score,
        correct_count: s.correct_count,
        total_tasks: s.tasks.length || exam.tasks_per_variant,
        percentage: s.max_score ? (s.score / s.max_score) * 100 : 0,
        time_spent_seconds: s.time_spent_seconds,
        started_at: s.started_at,
        submitted_at: s.submitted_at,
      }));
    return json(200, sessions);
  }

  const byCodeMatch = path.match(/^\/exams\/by-code\/([^/]+)$/);
  if (method === "GET" && byCodeMatch) {
    const exam = getExamByIdOrCode(byCodeMatch[1]);
    if (!exam) return json(404, { detail: "Экзамен не найден" });
    if (exam.status !== "active") return json(410, { detail: "Экзамен закрыт" });
    return json(200, {
      exam_id: exam.exam_id,
      title: exam.title,
      subject: "Математика",
      teacher_name: "Елена Учителева",
      total_time_minutes: exam.total_time_minutes,
      tasks_per_variant: exam.tasks_per_variant,
      variants_count: exam.variants_count,
      status: exam.status,
    });
  }

  const startMatch = path.match(/^\/exams\/by-code\/([^/]+)\/start$/);
  if (method === "POST" && startMatch) {
    const exam = getExamByIdOrCode(startMatch[1]);
    if (!exam || exam.status !== "active") return json(404, { detail: "Не найден" });
    const b = body as { student_name: string; class_level?: number };
    const variant = exam.variants[0];
    const mcMode = (exam.settings.mc_mode as string) ?? "auto";
    const sessionId = nextSessionId();
    const studentTasks = variant.tasks.map((t) => {
      const st = taskToStudentTask(t, mcMode);
      return {
        ...st,
        correct_answer: t.correct_answer,
        distractor_meta: t.distractor_meta,
      };
    });

    const session: ExamSession = {
      session_id: sessionId,
      exam_id: exam.exam_id,
      access_code: exam.access_code!,
      student_name: b.student_name,
      class_level: b.class_level ?? 8,
      variant_number: 1,
      status: "in_progress",
      tasks: studentTasks,
      answers: {},
      score: 0,
      max_score: variant.total_points,
      correct_count: 0,
      time_spent_seconds: 0,
      started_at: new Date().toISOString(),
      submitted_at: null,
      distractor_analytics: [],
    };
    demoState.examSessions.set(sessionId, session);

    return json(200, {
      session_id: sessionId,
      variant_number: 1,
      time_minutes: exam.total_time_minutes,
      tasks: studentTasks.map(({ correct_answer, distractor_meta, ...rest }) => rest),
    });
  }

  const submitMatch = path.match(/^\/exam-sessions\/([^/]+)\/submit$/);
  if (method === "POST" && submitMatch) {
    const session = demoState.examSessions.get(submitMatch[1]);
    if (!session) return json(404, { detail: "Сессия не найдена" });
    if (session.status === "submitted") return json(400, { detail: "Уже сдан" });

    const b = body as { answers: Record<string, string>; time_spent_seconds: number };
    session.answers = b.answers;
    session.time_spent_seconds = b.time_spent_seconds;
    session.status = "submitted";
    session.submitted_at = new Date().toISOString();

    let correct = 0;
    session.distractor_analytics = [];
    for (const task of session.tasks) {
      const ans = b.answers[task.task_id] ?? "";
      const fullTask = getTaskById(task.task_id);
      const check = checkAnswer(
        {
          correct_answer: task.correct_answer,
          distractor_meta: task.distractor_meta ?? fullTask?.distractor_meta ?? [],
          answer_options: fullTask?.answer_options ?? [],
        },
        ans,
      );
      if (check.is_correct) correct += 1;
      else if (check.distractor_hit) {
        session.distractor_analytics.push({
          task_id: task.task_id,
          distractor_value: check.distractor_hit.value,
          error_type: check.distractor_hit.error_type,
          explanation: check.distractor_hit.explanation,
        });
      }
    }

    session.correct_count = correct;
    session.score = correct * 10;
    session.max_score = session.tasks.length * 10;

    return json(200, {
      session_id: session.session_id,
      score: session.score,
      max_score: session.max_score,
      answered_count: Object.keys(b.answers).length,
      correct_count: correct,
      total_tasks: session.tasks.length,
      percentage: session.max_score ? (session.score / session.max_score) * 100 : 0,
    });
  }

  const resultsMatch = path.match(/^\/exam-sessions\/([^/]+)\/results$/);
  if (method === "GET" && resultsMatch) {
    const session = demoState.examSessions.get(resultsMatch[1]);
    if (!session) return json(404, { detail: "Не найдена" });
    if (session.status !== "submitted") return json(400, { detail: "Не сдан" });

    const exam = demoState.exams.get(session.exam_id);

    return json(200, {
      session_id: session.session_id,
      exam_title: exam?.title ?? "Экзамен",
      student_name: session.student_name,
      variant_number: session.variant_number,
      score: session.score,
      max_score: session.max_score,
      answered_count: Object.keys(session.answers).length,
      correct_count: session.correct_count,
      total_tasks: session.tasks.length,
      percentage: session.max_score ? (session.score / session.max_score) * 100 : 0,
      time_spent_seconds: session.time_spent_seconds,
      submitted_at: session.submitted_at,
      tasks: session.tasks.map((t) => {
        const ans = session.answers[t.task_id] ?? null;
        const check = checkAnswer(
          {
            correct_answer: t.correct_answer,
            distractor_meta: t.distractor_meta ?? [],
            answer_options: [],
          },
          ans ?? "",
        );
        const hit = session.distractor_analytics.find((d) => d.task_id === t.task_id);
        return {
          task_id: t.task_id,
          text: t.text,
          student_answer: ans,
          correct_answer: t.correct_answer,
          is_correct: check.is_correct,
          options: t.options,
          skill_name: t.skill_name,
          distractor_hit: hit
            ? { distractor_value: hit.distractor_value, error_type: hit.error_type, explanation: hit.explanation }
            : null,
        };
      }),
    });
  }

  return null;
}
