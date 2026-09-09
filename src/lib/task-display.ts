/** Pick the best display string for a task question (KaTeX-ready). */

import { prepareMathDisplay, pickAnswerDisplayText, pickOptionDisplayText } from "./math-display";

export { pickAnswerDisplayText, pickOptionDisplayText, prepareMathDisplay } from "./math-display";

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

// A `question_latex` far shorter than `question_text` is a bare formula, not a
// normalized rendering of the whole statement. Most of the task bank is stored
// that way: "Решите уравнение: $4\sin^2 x + 8\cos x + 1 = 0$" in the text
// against only "4\sin^2 x + 8\cos x + 1 = 0" in the LaTeX column. Preferring
// LaTeX unconditionally therefore dropped the instruction wording — "Решите",
// "Найдите", "Проверьте" — from every exam and diagnostic screen, and left the
// undelimited fragment to print as literal `\quad` and `x^2` because the
// renderer only treats a delimited or Latin-only string as math.
const LATEX_FRAGMENT_RATIO = 0.6;

export function pickTaskDisplayText(opts: {
  task_id?: string;
  question_text: string;
  question_latex?: string | null;
}): string {
  const text = (opts.question_text || "").trim();
  const latex = (opts.question_latex || "").trim();
  if (!latex) return text;
  if (!text) return latex;
  // The server still owns LaTeX normalization: this chooses which field to
  // show and never parses or rewrites either of them.
  if (latex.length < text.length * LATEX_FRAGMENT_RATIO) return text;
  return latex;
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

export function pickDistractorExplanation(dm: {
  explanation?: string | null;
  error_logic_latex?: string | null;
  error_logic?: string | null;
}): string {
  const latex = (dm.error_logic_latex || "").trim();
  const expl = (dm.explanation || "").trim();
  const logic = (dm.error_logic || "").trim();
  return latex || expl || logic || "";
}

