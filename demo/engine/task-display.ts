/** Pick the best display string for a task question (KaTeX-ready). */

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

export function wrapBareMath(text: string): string {
  let s = text.replace(/\\\\/g, "\n").trim();
  if (!s) return s;
  if (/\$[^$]+\$/.test(s)) return s;

  s = s.replace(/\\sqrt\{[^}]+\}/g, (m) => `$${m}$`);
  s = s.replace(/\\frac\{[^}]+\}\{[^}]+\}/g, (m) => `$${m}$`);

  const eqMatch = s.match(
    /([\d.,]*\s*[a-zA-Z]?(?:\^\{?[^}\s]+)?(?:\s*[\+\-·\*\/]\s*[\d.,a-zA-Z^{}\(\)\\sqrt\s]+)+\s*=\s*[\d.,a-zA-Z^{}\(\)\\sqrt\s+\-]+)/,
  );
  if (eqMatch) {
    const eq = eqMatch[1];
    s = s.replace(eq, wrapEquation(eq));
  }

  s = s.replace(
    /(\(\s*[^()]+?\s*\)\s*\^(?:\{[^}]+\}|\d+|[a-zA-Z]))/g,
    (m) => (m.includes("$") ? m : wrapEquation(m)),
  );

  if (!/\$/.test(s) && /[\^=\\]|[a-zA-Z]\s*[\d(]|\([^)]+\)\s*\^/.test(s) && !/[а-яё]{5,}/i.test(s)) {
    return wrapEquation(s);
  }

  if (/\\sqrt/.test(s) || /\^/.test(s)) {
    const mathy = s.match(/[0-9a-zA-Z\\^_{}\(\)\+\-\·\*\/=.,\s]+/);
    if (mathy && mathy[0].length > 2) {
      return s.replace(mathy[0], wrapEquation(mathy[0]));
    }
  }

  return s;
}

export function pickTaskDisplayText(opts: {
  task_id?: string;
  question_text: string;
  question_latex?: string | null;
}): string {
  const text = (opts.question_text || "").trim();
  const latex = (opts.question_latex || "").trim();
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

export function pickAnswerDisplayText(
  answer: string,
  answerLatex?: string | null,
): string {
  const latex = (answerLatex || "").trim();
  if (latex) return latex;
  if (!answer) return "";
  if (/\$/.test(answer)) return answer;
  if (/[=±√\^\\]/.test(answer) || /x\s*=/.test(answer) || /\\frac|\\sqrt/.test(answer)) {
    return wrapBareMath(answer);
  }
  return answer;
}

export function pickOptionDisplayText(
  content: string,
  contentLatex?: string | null,
): string {
  return pickAnswerDisplayText(content, contentLatex);
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
