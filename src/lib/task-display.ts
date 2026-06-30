/** Pick the best display string for a task question (KaTeX-ready). */

import { wrapBareMath } from "./math-display";

export { pickAnswerDisplayText, pickOptionDisplayText, wrapBareMath } from "./math-display";

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

export function pickTaskDisplayText(opts: {
  task_id?: string;
  question_text: string;
  question_latex?: string | null;
}): string {
  const text = (opts.question_text || "").trim();
  const latex = (opts.question_latex || "").trim();
  // ALG compounds: question_latex is fuller; TB: question_text has prose + math.
  const source = latex.length > text.length ? latex : text || latex;
  if (!source) return "";

  const idx = subpartIndex(opts.task_id);
  let part = extractNumberedPart(source, idx);

  if (part.includes(";") && /\d+[\\).]\s*\$/.test(part)) {
    part = part.split(/;\s*(?=\d+[\\).])/)[0].replace(/^\d+[\\).]\s*/, "").trim();
  }

  part = part.replace(/^Решите\s+уравнени[ея]:\s*/i, "").trim();

  if (/=/.test(part) && !part.startsWith("$")) {
    return `Решите уравнение: ${wrapBareMath(part)}`;
  }

  if (/^(Найдите|Вычислите|Упростите|Сократите|Определите|Сравните)/i.test(part)) {
    const m = part.match(/^([А-Яа-яЁё\s]+:?\s*)(.+)$/);
    if (m) return `${m[1].trim()} ${wrapBareMath(m[2])}`;
  }

  return wrapBareMath(part);
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
