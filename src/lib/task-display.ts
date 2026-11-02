/** Pick the best display string for a task question (KaTeX-ready). */

import { prepareMathDisplay, type MathDisplayProjection } from "./math-display";

export {
  pickAnswerDisplayText,
  pickAnswerDisplayProjection,
  pickOptionDisplayText,
  pickOptionDisplayProjection,
  prepareMathDisplay,
  type MathDisplayProjection,
} from "./math-display";

// wrapBareMath lives in math-display.ts (re-exported above)

export interface TaskDisplayFields {
  task_id?: string;
  question_text: string;
  question_latex?: string | null;
  attested_fields?: string[] | null;
  latex_attested?: boolean | null;
  content_quality?: { latex_attested_fields?: string[] } | Record<string, unknown> | null;
}

/**
 * Select the display source for a question.
 *
 * `question_latex` is the canonical statement shown to students in exams and
 * diagnostics: the content bank keeps it complete (instruction wording
 * included) and equal in meaning to `question_text`, which is audited batch by
 * batch.  `question_text` is only a fallback for rows without LaTeX.
 */
export function pickTaskDisplayProjection(opts: TaskDisplayFields): MathDisplayProjection {
  const text = (opts.question_text || "").trim();
  const latex = (opts.question_latex || "").trim();

  if (latex) {
    return { text: latex, renderMode: "trusted" };
  }

  if (text) {
    return { text: prepareMathDisplay(text), renderMode: "legacy" };
  }

  return { text: "", renderMode: "legacy" };
}

/** Compatibility helper for callers which only need the selected string. */
export function pickTaskDisplayText(opts: TaskDisplayFields): string {
  return pickTaskDisplayProjection(opts).text;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  sign_error: "Ошибка знака",
  arithmetic: "Арифметика",
  formula: "Формула",
  common_mistake: "Типичная ошибка",
  magnitude_error: "Порядок числа",
  wrong_operation: "Операция",
  sign_transfer_error: "Перенос через =",
  off_by_one: "Ошибка ±1",
  formula_swap: "Неверная формула",
  partial_solution: "Промежуточный шаг",
  digit_swap: "Перестановка цифр",
  operation_swap: "×↔÷",
  random_plausible: "Близкое число",
};

export function formatErrorType(errorType?: string): string {
  if (!errorType || errorType.startsWith("ai_")) return "Типичная ошибка";
  return ERROR_TYPE_LABELS[errorType] ?? "Типичная ошибка";
}

export interface DistractorExplanationFields {
  explanation?: string | null;
  error_logic_latex?: string | null;
  error_logic?: string | null;
}

export function pickDistractorExplanationProjection(
  dm: DistractorExplanationFields,
): MathDisplayProjection {
  const latex = (dm.error_logic_latex || "").trim();
  const expl = (dm.explanation || "").trim();
  const logic = (dm.error_logic || "").trim();
  if (latex) return { text: latex, renderMode: "trusted" };
  return { text: prepareMathDisplay(expl || logic || ""), renderMode: "legacy" };
}

/** Compatibility helper for callers which only need the selected string. */
export function pickDistractorExplanation(dm: DistractorExplanationFields): string {
  return pickDistractorExplanationProjection(dm).text;
}
