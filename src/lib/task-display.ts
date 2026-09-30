/** Pick the best display string for a task question (KaTeX-ready). */

import {
  prepareMathDisplay,
  pickAnswerDisplayText,
  pickAnswerDisplayProjection,
  pickOptionDisplayText,
  pickOptionDisplayProjection,
  type MathDisplayProjection,
} from "./math-display";

export {
  pickAnswerDisplayText,
  pickAnswerDisplayProjection,
  pickOptionDisplayText,
  pickOptionDisplayProjection,
  prepareMathDisplay,
  type MathDisplayProjection,
} from "./math-display";

function subpartIndex(taskId?: string): number | null {
  if (!taskId) return null;
  const m = taskId.match(/\.(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function extractNumberedPart(text: string, index: number | null): string {
  if (!index || index < 1) return text;
  const re = new RegExp(`${index}[\\).]\\s*([^;\\n]+)`, "i");
  const m = text.match(re);
  if (m) return m[1].trim();
  const chunks = text.split(/;\s*(?=\d+[\\).])/);
  if (chunks.length >= index) {
    return chunks[index - 1].replace(/^\d+[\\).]\s*/, "").trim();
  }
  return text;
}

function wrapEquation(expr: string): string {
  const e = expr
    .trim()
    .replace(/,\s*(\d)/g, ".$1")
    .replace(/\^(\d+)/g, "^{$1}")
    .replace(/\^([a-zA-Z])/g, "^{$1}");
  return `$${e}$`;
}

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
 * Check if the LaTeX question projection is attested and trustworthy.
 */
export function isQuestionLatexAttested(opts: TaskDisplayFields): boolean {
  if (opts.latex_attested === true) return true;
  if (Array.isArray(opts.attested_fields) && opts.attested_fields.includes("question")) {
    return true;
  }
  const cq = opts.content_quality as { latex_attested_fields?: string[] } | null;
  if (cq && Array.isArray(cq.latex_attested_fields) && cq.latex_attested_fields.includes("question")) {
    return true;
  }
  return false;
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

  // A bare formula (older snapshots) carries none of the instruction wording;
  // such a row keeps the statement from question_text instead.
  const hasWords = /[А-Яа-яЁё]/;
  if (latex && (hasWords.test(latex) || !hasWords.test(text))) {
    return { text: latex, renderMode: "trusted" };
  }
  // Wording without its own formula: show the wording followed by the formula.
  if (latex && !text.includes("$")) {
    return { text: `${text}\n${latex}`, renderMode: "trusted" };
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
