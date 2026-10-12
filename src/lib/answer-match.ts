/**
 * Matching of a student's stored answer to the options of a (possibly since-repaired) task.
 * Pure functions, tested in tests/diagnostic-report.test.cjs (re-exported by diagnostic-report.ts).
 */

// A robust comparison key for math & text options: normalizes LaTeX macros, empty sets, and Unicode symbols
// (\dfrac, \frac, \sqrt, \left, \right, \emptyset, commas, $, spaces, minuses, \infty, \leq, \geq, \neq, \in, \cup, \cap, \mathbb, \approx, \Delta, \setminus, ^{...}, _{...})
// to reliably highlight the student's chosen answer and the correct answer without false fallback banners.
export function canonicalAnswerKey(value: string | null | undefined): string {
  let s = (value || "").trim();
  if (!s) return "";
  // 1. Strip outer and inline LaTeX math delimiters
  s = s.replace(/\$\$/g, "").replace(/\$/g, "");
  // 1b. LaTeX spacing / escaped punctuation: `\,` `\;` `\ ` `\quad`, `\{` `\}` `\%` are not content
  s = s.replace(/\\(?:quad|qquad)(?![a-zA-Z])/g, " ").replace(/\\[,;:! ]/g, " ");
  s = s.replace(/\\([{}|%&#_])/g, "$1");
  // 1c. Unicode super / subscripts -> ^2 / _2
  const SUP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^" + [...m].map((c) => SUP[c]).join(""));
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => "_" + [...m].map((c) => SUB[c]).join(""));
  // 1d. function names: \ln, \log, \sin ... are the same as plain "ln", "log", "sin" (the generic
  //     step 9 drops unknown commands, which would delete them from the LaTeX side only)
  s = s.replace(/\\(ln|log|lg|sin|cos|tan|tg|ctg|cot|sec|csc|arcsin|arccos|arctan|arctg|arcctg|sinh|cosh|tanh|exp|lim|max|min|gcd|lcm|det|mod)(?![a-zA-Z])/g, "$1");
  // 2. Normalize mathematical minuses and dashes (U+2212, U+2013, U+2014) to standard hyphen
  s = s.replace(/\u2212/g, "-").replace(/\u2013/g, "-").replace(/\u2014/g, "-");
  
  // 3. Strip structural modifiers FIRST (\left, \right, \displaystyle, \limits, \text{...})
  s = s.replace(/\\?(?:left|right|displaystyle|limits)\b/g, "");
  s = s.replace(/\\?(?:text|textbf|textit|mathrm|mathbf|mathit|operatorname|mbox)\s*\{([^{}]*)\}/g, "$1");
  
  // 4. Empty set & no solution normalization
  s = s.replace(/\\?(?:emptyset|varnothing|empty)\b|[∅⌀Ø]/g, "emptyset");
  s = s.replace(/нет\s*(?:действительных\s*)?(?:корней|решений)|(?:корней|решений)\s*нет/gi, "emptyset");
  
  // 5. Simplify single-level exponents and subscripts before fractions to avoid nested braces
  // e.g. e^{x} -> e^x, x_{0} -> x_0, a^{2} -> a^2
  while (/\^\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\^\{([^{}]+)\}/g, "^$1");
  }
  while (/_\{([^{}]+)\}/.test(s)) {
    s = s.replace(/_\{([^{}]+)\}/g, "_$1");
  }
  
  // 6. Roots: \sqrt{x} -> sqrt(x), \sqrt[n]{x} -> (x)^(1/n)
  while (/\\?sqrt\s*\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\?sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
  }
  s = s.replace(/\\?sqrt/g, "sqrt").replace(/√/g, "sqrt");
  
  // 7. Fractions: recursively resolve \frac{num}{den} and \dfrac{num}{den}
  while (/\\?(?:dfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\?(?:dfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  }
  s = s.replace(/\\?(?:dfrac|frac)\b/g, "/");
  
  // 8. Inequalities, approximations, set operations, and relations
  s = s.replace(/\\?(?:approx|thickapprox|sim|simeq)\b|≈|~/g, "≈");
  s = s.replace(/\\?(?:Delta|delta)\b|Δ|δ/g, "Δ");
  s = s.replace(/\\?(?:prime)\b|'/g, "'");
  s = s.replace(/\\?(?:leq|le)\b|≤/g, "<=");
  s = s.replace(/\\?(?:geq|ge)\b|≥/g, ">=");
  s = s.replace(/\\?(?:neq|ne)\b|≠/g, "!=");
  s = s.replace(/\\?notin\b|∉/g, "!in");
  s = s.replace(/\\?(?:setminus|backslash)\b|\\/g, "\\");
  s = s.replace(/\\?in\b|∈/g, "in");
  s = s.replace(/\\?infty\b|∞/g, "inf");
  s = s.replace(/\\?cup\b|∪/g, "U");
  s = s.replace(/\\?cap\b|∩/g, "cap");
  s = s.replace(/\\?(?:cdot|times)\b|\*|·/g, "");
  s = s.replace(/\\?mathbb\{R\}|\\?mathbb\s+R|ℝ/g, "R");
  s = s.replace(/\\?mathbb\{Z\}|\\?mathbb\s+Z|ℤ/g, "Z");
  s = s.replace(/\\?mathbb\{Q\}|\\?mathbb\s+Q|ℚ/g, "Q");
  s = s.replace(/\\?mathbb\{N\}|\\?mathbb\s+N|ℕ/g, "N");
  s = s.replace(/\\?pi\b|π/g, "pi");
  s = s.replace(/\^?\\?circ\b|°/g, "");
  s = s.replace(/\{,\}/g, ".").replace(/,/g, ".");
  
  // Russian preamble and helper words normalization
  s = s.replace(/область\s+определения\s+функци[ияй]/gi, "");
  s = s.replace(/множество\s+значений\s+функци[ияй]/gi, "");
  s = s.replace(/функци[ияй]/gi, "");
  s = s.replace(/\bдля\b/gi, "");
  s = s.replace(/\bпри\b/gi, "");
  s = s.replace(/\bгде\b/gi, "");
  
  // 9. Strip remaining latex command backslashes, curly braces, and whitespace
  s = s.replace(/\\[a-zA-Z]+/g, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/[:;,.]/g, "");
  s = s.replace(/\s+/g, "");
  return s.toLowerCase();
}

export function areAnswersEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = canonicalAnswerKey(a);
  const kb = canonicalAnswerKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // If only difference is extra outer/inner parentheses around terms
  const stripParens = (str: string) => str.replace(/[()]/g, "");
  if (stripParens(ka) === stripParens(kb)) return true;
  return false;
}

export function matchesOption(answer: string | null | undefined, opt: string, latexOpt: string, index: number): boolean {
  if (!answer) return false;
  const ans = answer.trim();
  if (!ans) return false;
  
  // 1. Direct / canonical equivalence
  if (areAnswersEquivalent(ans, opt) || areAnswersEquivalent(ans, latexOpt)) {
    return true;
  }
  
  const canAns = canonicalAnswerKey(ans);
  
  // 2. Letter matches ("A", "B", "C", "D" or "а", "б", "в", "г")
  const enLetter = String.fromCharCode(65 + index).toLowerCase();
  const ruLetter = ["а", "б", "в", "г", "д", "е"][index] || "";
  if (canAns === enLetter || canAns === ruLetter) {
    return true;
  }

  // 3. Explicit index patterns ("option_0", "choice_1", "opt_2", "#0")
  const explicitIndexMatch = ans.match(/^(?:option|choice|opt|ans|idx|#)[_\s-]*([0-9]+)$/i);
  if (explicitIndexMatch && parseInt(explicitIndexMatch[1], 10) === index) {
    return true;
  }
  
  return false;
}

// ─── The chosen option of an error record ─────────────────────────────────────

/**
 * Index of the option the student chose, when the record carries it. The report does not
 * send one today (`answer_id` is the UUID of the ANSWER, not of an option), so matching by
 * text is the rule; a numeric `student_option_index` / `selected_option_index` /
 * `chosen_option_index` / `student_answer_index` is used when a future report has it.
 */
export function chosenOptionIndex(entry: Record<string, unknown> | null | undefined, optionCount: number): number | null {
  for (const key of ["student_option_index", "selected_option_index", "chosen_option_index", "student_answer_index"]) {
    const v = entry?.[key];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < optionCount) return v;
  }
  return null;
}

/**
 * Which option the student chose: the carried index, else the first option whose text
 * matches the stored answer (matchesOption). -1 when none: the option was changed after the
 * attempt (a content repair), so the stored text no longer equals any current option.
 */
export function findChosenOption(
  entry: Record<string, unknown> & { student_answer?: string | null },
  options: Array<{ opt: string; latex: string; originalIndex?: number }>,
  originalCount: number = options.length,
): number {
  const carried = chosenOptionIndex(entry, originalCount);
  if (carried !== null) {
    const at = options.findIndex((o, i) => (o.originalIndex ?? i) === carried);
    if (at >= 0) return at;
  }
  return options.findIndex((o, i) => matchesOption(entry.student_answer, o.opt, o.latex, i));
}

export const CHOSEN_LEGACY_OPTION_LABEL = "Выбранный ответ ученика (вариант из прежней версии задания):";
export const ENTERED_ANSWER_LABEL = "Введённый ответ ученика:";

/**
 * Label of an answer that matches no current option. In a task with options the student
 * SELECTED something - an option of an earlier version of the task - so it is never called
 * "entered"; «Введённый» is for open / short-answer tasks only.
 */
export function unmatchedAnswerLabel(answerType: unknown, optionCount: number): string {
  const choice = optionCount > 0 || /^(mcq|choice|single|multiple|select|multi)/i.test(String(answerType ?? ""));
  return choice ? CHOSEN_LEGACY_OPTION_LABEL : ENTERED_ANSWER_LABEL;
}
