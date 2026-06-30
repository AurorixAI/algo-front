import type { DemoTask, ExamDraft, ExamDraftTask, ExamVariant } from "../types";
import { buildMcOptions, shuffle } from "./grader";
import { pickTaskDisplayText } from "./task-display";
import {
  getTasksBySkillIds,
  getTasksByParagraphIds,
  nextExamId,
  getTasksForClass,
} from "./state";

export interface GenerateExamInput {
  title: string;
  textbook_id?: string;
  skill_ids?: string[];
  paragraph_ids?: number[];
  tasks_count?: number;
  time_minutes?: number;
  variants_count?: number;
  shuffle_tasks?: boolean;
  mc_mode?: string;
  class_level?: number;
}

function taskToDraftTask(task: DemoTask): ExamDraftTask {
  const display = pickTaskDisplayText(task);
  const mcOpts = buildMcOptions(task);
  return {
    task_id: task.task_id,
    skill_id: task.skill_id,
    skill_name: task.skill_name,
    difficulty: task.difficulty,
    question_text: display,
    question_latex: display,
    question_image_url: null,
    answer_type: task.answer_type,
    correct_answer: task.correct_answer,
    answer_options: mcOpts.length >= 2 ? mcOpts : task.answer_options,
    distractor_meta: task.distractor_meta,
    is_template_generated: false,
  };
}

function inferClassLevel(input: GenerateExamInput): number {
  if (input.class_level) return input.class_level;
  if (input.skill_ids?.length) {
    const m = input.skill_ids[0].match(/^G(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const fromTask = getTasksForClass(8).find((t) => input.skill_ids?.includes(t.skill_id));
  if (fromTask) return fromTask.class_level;
  return 8;
}

export function generateExam(input: GenerateExamInput): ExamDraft {
  const count = input.tasks_count ?? 10;
  const variantsCount = input.variants_count ?? 1;
  const classLevel = inferClassLevel(input);

  let pool: DemoTask[] = [];
  if (input.skill_ids?.length) {
    pool = getTasksBySkillIds(input.skill_ids, classLevel);
  } else if (input.paragraph_ids?.length) {
    pool = getTasksByParagraphIds(input.paragraph_ids, classLevel);
  }

  if (pool.length < count) {
    const extra = getTasksForClass(classLevel).filter(
      (t) => !pool.find((p) => p.task_id === t.task_id),
    );
    pool = [...pool, ...extra];
  }

  pool = shuffle(pool).slice(0, Math.max(count, pool.length > 0 ? Math.min(count, pool.length) : count));

  const variants: ExamVariant[] = [];
  for (let v = 1; v <= variantsCount; v++) {
    let tasks = [...pool];
    if (input.shuffle_tasks !== false && v > 1) {
      tasks = shuffle(tasks);
    }
    if (tasks.length > count) tasks = tasks.slice(0, count);

    variants.push({
      variant_id: String(v),
      variant_number: v,
      total_points: tasks.length * 10,
      tasks: tasks.map(taskToDraftTask),
    });
  }

  const skills = Array.from(new Set(pool.map((t) => t.skill_id)));

  return {
    exam_id: nextExamId(),
    title: input.title,
    status: variantsCount > 1 ? "variants_ready" : "draft",
    access_code: null,
    total_time_minutes: input.time_minutes ?? 45,
    variants_count: variantsCount,
    tasks_per_variant: count,
    settings: {
      time_minutes: input.time_minutes ?? 45,
      shuffle_tasks: input.shuffle_tasks ?? true,
      mc_mode: input.mc_mode ?? "auto",
      skill_ids: input.skill_ids ?? [],
      paragraph_ids: input.paragraph_ids ?? [],
      textbook_id: input.textbook_id,
      class_level: classLevel,
    },
    skills_covered: skills,
    created_at: new Date().toISOString(),
    variants,
  };
}

export function getAlternativesForTask(
  exam: ExamDraft,
  taskId: string,
  classLevel = 8,
): ExamDraftTask[] {
  const current = exam.variants.flatMap((v) => v.tasks).find((t) => t.task_id === taskId);
  if (!current) return [];

  const pool = getTasksForClass(classLevel).filter(
    (t) => t.skill_id === current.skill_id && t.task_id !== taskId,
  );
  return pool.slice(0, 5).map(taskToDraftTask);
}
