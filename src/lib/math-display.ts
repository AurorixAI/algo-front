const BARE_LATEX_COMMANDS = new Set([
  "\\frac", "\\dfrac", "\\sqrt", "\\sin", "\\cos", "\\tg", "\\ctg",
  "\\log", "\\ln", "\\lim", "\\alpha", "\\beta", "\\gamma", "\\pi",
  "\\infty", "\\Delta", "\\Sigma", "\\Omega", "\\theta", "\\int",
  "\\sum", "\\prod", "\\pm", "\\mp", "\\neq", "\\geq", "\\leq",
  "\\approx", "\\equiv", "\\to", "\\Rightarrow", "\\in", "\\cup",
  "\\cap", "\\emptyset", "\\vec", "\\hat", "\\overline", "\\underline"
]);

const TWO_ARG_COMMANDS = new Set([
  "\\dfrac", "\\frac", "\\tfrac", "\\cfrac", "\\binom", "\\stackrel", "\\overset", "\\underset"
]);

const LATEX_COMMAND_RE = /\\[a-zA-Z]+|[\^_]/;
const CYRILLIC_RE = /[а-яА-ЯёЁ]/;

/**
 * A display projection is deliberately paired with its render contract.
 * A string alone cannot tell `MathRenderer` whether it came from immutable
 * legacy text or from an audited server-side LaTeX projection.
 */
export interface MathDisplayProjection {
  text: string;
  renderMode: "legacy" | "trusted";
}

function looksLikeMathExpr(s: string): boolean {
  if (CYRILLIC_RE.test(s)) return false;
  return /^[0-9a-zA-Z\s\+\-\*\/\=\(\)\[\]\{\}\.,\^]+$/.test(s) && /[\+\-\*\/\=\^\[\]\{\}]/.test(s);
}

function cleanLatexSpacing(s: string): string {
  return s
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\quad/g, " ")
    .replace(/\\qquad/g, " ");
}

function normalizeSqrtNotation(s: string): string {
  return s
    .replace(/\bsqrt\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/√\(([^()]+)\)/g, "\\sqrt{$1}")
    .replace(/√(\d+(?:\.\d+)?)/g, "\\sqrt{$1}");
}

function convertMathFunctions(s: string): string {
  return s.replace(/(?<!\\)\b(sin|cos|tg|ctg|arcsin|arccos|arctg|arcctg|log|ln|lim)(?=\s|\(|\_|\^)/g, "\\$1");
}

function unicodeToLatex(s: string): string {
  return s
    .replace(/≤/g, "\\leq ")
    .replace(/≥/g, "\\geq ")
    .replace(/≠/g, "\\neq ")
    .replace(/≈/g, "\\approx ")
    .replace(/∞/g, "\\infty ")
    .replace(/π/g, "\\pi ")
    .replace(/(\b\d+|\b[a-zA-Z]|\\[a-zA-Z]+)\s*°/g, "$1^{\\circ}")
    .replace(/°/g, "^{\\circ}")
    .replace(/×/g, "\\times ")
    .replace(/·/g, "\\cdot ")
    .replace(/÷/g, "\\div ")
    .replace(/±/g, "\\pm ")
    .replace(/∓/g, "\\mp ");
}

export function fixSpacingAroundMath(s: string): string {
  s = s.replace(/(\d+)([а-яА-ЯёЁ]+)/g, "$1 $2");
  s = s.replace(/([а-яА-ЯёЁ]+)(\d+)/g, "$1 $2");
  s = s.replace(/([.,!?:;])([а-яА-ЯёЁ])/g, "$1 $2");
  return s;
}

export function normalizeMathExponents(s: string): string {
  let res = s
    .replace(/\^(-?\d+)/g, "^{$1}")
    .replace(/\^([a-zA-Z])/g, "^{$1}")
    .replace(/\^\(([^()]+)\)/g, "^{$1}");

  res = res.replace(/(\|[^|]+\||[a-zA-Z0-9_\-]+)\s*\/\s*([a-zA-Z0-9_\-]+)/g, "\\dfrac{$1}{$2}");
  res = res.replace(/\(([^\(\)]+)\)\s*\/\s*\(([^\(\)]+)\)/g, "\\dfrac{$1}{$2}");
  res = res.replace(/\(([^\(\)]+)\)\s*\/\s*([a-zA-Z0-9_\-]+)/g, "\\dfrac{$1}{$2}");
  res = res.replace(/([a-zA-Z0-9_\-]+)\s*\/\s*\(([^\(\)]+)\)/g, "\\dfrac{$1}{$2}");

  return res;
}

function hasComplexLatex(s: string): boolean {
  return /\\(?:left|right|begin|end|frac|dfrac|sum|prod|int|oint|binom|stackrel|overset|underset)(?![a-zA-Z])/.test(s);
}

function hasCyrillicProse(s: string): boolean {
  return /[а-яА-ЯёЁ]{2,}/.test(s) || /[а-яА-ЯёЁ]\s+[а-яА-ЯёЁ]/.test(s);
}

function extractMathChunk(s: string, startIdx: number): { text: string; end: number } | null {
  const m = s.slice(startIdx).match(/^\\[a-zA-Z]+/);
  if (!m) return null;
  const cmd = m[0];
  let i = startIdx + cmd.length;
  
  const targetBraces = TWO_ARG_COMMANDS.has(cmd) ? 2 : 1;
  let bracesFound = 0;
  let bracesCurrent = 0;

  while (i < s.length) {
    const char = s[i];
    if (char === '{') {
      bracesCurrent++;
    } else if (char === '}') {
      bracesCurrent--;
      if (bracesCurrent === 0) {
        bracesFound++;
        if (bracesFound >= targetBraces) {
          i++;
          break;
        }
      }
    } else if (bracesCurrent === 0 && bracesFound === 0) {
      if (/[а-яА-ЯёЁ]/.test(char)) break;
      if (s.slice(i).match(/^\s*,\s*[а-яА-ЯёЁ]/)) break;
      if (s.slice(i).match(/^\s+и\s+/)) break;
    }
    i++;
  }

  const trailingMatch = s.slice(i).match(/^(\s*(?:[+*/=<>≤≥\-]|\\leqslant|\\geqslant|\\neq|\\leq|\\geq|\\cdot|\\times)\s*[a-zA-Z0-9_^()+*/\-]+)+/);
  if (trailingMatch) {
    i += trailingMatch[0].length;
  }

  return { text: s.slice(startIdx, i).trim(), end: i };
}

export function insertSpacesAroundInlineMath(s: string): string {
  return s
    .replace(/(\$[^$]+\$)([а-яА-ЯёЁ])/g, "$1 $2")
    .replace(/([а-яА-ЯёЁ])(\$[^$]+\$)/g, "$1 $2")
    .replace(/([:;])(\$[^$]+\$)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wraps bare LaTeX in a mixed prose string with $...$ delimiters.
 * Handles:
 *  1. Already has $...$ → just fix spacing
 *  2. Comma-separated "f(x) = val" lists mixed with Russian words
 *  3. Prefix sentence + math body
 *  4. General mixed prose
 */
function wrapBareLatexInProse(s: string): string {
  s = normalizeSqrtNotation(s);

  // Already has $...$ → just fix spacing
  if (/\$[^$]+\$/.test(s)) {
    return insertSpacesAroundInlineMath(s);
  }

  // Clean up common typos
  s = s.replace(/,\\f/g, ", f").replace(/\\f\s*\\left/g, "\\left");

  // ── Case 1: Comma-separated f(x)=val list with embedded Russian words ──────
  // Detect pattern: contains multiple "f(...)=..." groups separated by commas
  // e.g. "f(-2)=-1,\ f(-1)=-1,\ f(0) не определено ,\ f(5)=1,..."
  if (/\bf\s*\(/.test(s) || /\\left|\\dfrac|\\frac|\\neq|\\leq|\\geq/.test(s)) {
    // Split on comma followed by space/backslash
    const segments = s.split(/,\s*\\?\s*/);
    if (segments.length >= 2) {
      const wrapped = segments.map(seg => {
        seg = seg.trim();
        if (!seg) return "";
        // Check if this segment has Cyrillic
        if (CYRILLIC_RE.test(seg)) {
          // Split on Cyrillic words to wrap math portions
          // e.g. "f(0) не определено" → "$f(0)$ не определено"
          const mathCyrillic = seg.match(/^(.+?)\s+([а-яА-ЯёЁ].*)$/);
          if (mathCyrillic) {
            const mathPart = mathCyrillic[1].trim();
            const ruPart = mathCyrillic[2].trim();
            return `$${normalizeMathExponents(mathPart)}$ ${ruPart}`;
          }
          return seg;
        }
        // Pure math segment → wrap in $...$
        return `$${normalizeMathExponents(seg)}$`;
      });
      return wrapped.filter(Boolean).join(", ");
    }
  }

  // ── Case 2: Prefix sentence + math body ──────────────────────────────────
  const prefixMatch = s.match(/^((?:Решите(?:\s+систему)?(?:\s+уравнени[а-я]*)?|Найдите|Вычислите|Упростите|Сократите|Определите|Сравните|Докажите|Представьте|Укажите|Известно|Постройте)[^:]*:\s*)(.*)/i);
  if (prefixMatch) {
    const pref = prefixMatch[1].trim();
    const body = prefixMatch[2].trim();
    if (body) {
      if (body.startsWith("$") && body.endsWith("$")) {
        return `${pref} ${body}`;
      }
      return `${pref} $${normalizeMathExponents(body)}$`;
    }
  }

  s = s.replace(/(\b\d+\^{\\circ}|\b[a-zA-Z]+\^{\\circ})/g, " $$1$ ");

  // ── Case 3: General prose — split on known Russian separator words ─────────
  const parts = s.split(/(\s+—\s+|\s+\b(?:неверно|функция|следовательно|получаем|так как|равна|уравнение|решением|при|стремится|модуль|дроби|определено|является)\b)/i);
  const newParts: string[] = [];

  for (const p of parts) {
    const pStr = p.trim();
    if (!pStr) continue;
    if (/[а-яА-ЯёЁ—]/.test(pStr)) {
      newParts.push(pStr);
    } else {
      const m = pStr.replace(/\$/g, "");
      if (m.length >= 1 && !["(", ")", "[", "]", ";", ","].includes(m)) {
        newParts.push(` $${normalizeMathExponents(m)}$ `);
      } else {
        newParts.push(pStr);
      }
    }
  }

  return insertSpacesAroundInlineMath(newParts.join(" "));
}

function wrapGenericMathSegments(s: string): string {
  if (/\$[^$]+\$/.test(s)) {
    return insertSpacesAroundInlineMath(s);
  }

  const parts = s.split(/([а-яА-ЯёЁ]+)/);
  const wrapped = parts.map((part) => {
    if (!part) return part;
    if (CYRILLIC_RE.test(part)) return part;

    const leading = part.match(/^[\s,;:.!?–—-]*/)?.[0] || "";
    const trailing = part.match(/[\s,;:.!?–—-]*$/)?.[0] || "";
    const core = part.slice(leading.length, part.length - trailing.length).trim();
    if (!core) return part;

    const normalizedCore = normalizeSqrtNotation(core);

    const mathy =
      LATEX_COMMAND_RE.test(normalizedCore) ||
      /[\^_=±√\\<>≤≥]|[a-zA-Z]\s*[\d(]|\([^)]+\)\s*\^|\d\s*[a-zA-Z]|[+\-·*/]\s*[\d(a-zA-Z]/.test(normalizedCore);

    if (!mathy) return part;

    return `${leading}$${normalizeMathExponents(cleanLatexSpacing(unicodeToLatex(normalizedCore)))}$${trailing}`;
  });

  return insertSpacesAroundInlineMath(wrapped.join(""));
}

/**
 * Prepares a legacy question statement for the renderer without changing the
 * statement itself.  Some older records contain a complete Russian condition
 * in `question_text`, but only parts of the formula are un-delimited
 * (for example `f(x) = x^3`).  KaTeX intentionally treats that as prose.
 *
 * Existing `$…$`, `\\(…\\)`, `\\[…\\]` and `$$…$$` fragments are left exactly as
 * they arrived from the content service.  Only the prose in between is passed
 * through the conservative legacy math wrapper.  This keeps a verified LaTeX
 * projection intact and prevents a display helper from silently dropping or
 * rewriting the instructional part of a task.
 */
export function prepareMathDisplay(text: string): string {
  const source = (text || "").trim();
  if (!source) return "";

  const preservedMath = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^\n$]+\$)/g;
  const isPreservedMath = /^(?:\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^\n$]+\$)$/;
  const parts = source.split(preservedMath);
  const prepared = parts.map((part) => {
    if (!part) return part;
    if (isPreservedMath.test(part)) return part;
    return wrapGenericMathSegments(part);
  }).join("");

  return insertSpacesAroundInlineMath(prepared);
}


export function wrapBareMath(text: string): string {
  const s = normalizeSqrtNotation(text.trim());
  if (!s) return s;

  const proseWrapped = wrapBareLatexInProse(s);
  if (/\$[^$]+\$/.test(proseWrapped)) {
    return proseWrapped;
  }

  return wrapGenericMathSegments(proseWrapped);
}

export function pickAnswerDisplayProjection(
  answer: string,
  answerLatex?: string | null,
): MathDisplayProjection {
  // A verified display projection is authoritative and passes through
  // untouched by the browser. Old records may not have one; in that case we
  // only add math delimiters around safe raw fragments so that `x^2` and
  // `f(0)` are rendered rather than printed as source text. The raw answer
  // itself is never replaced or sent back to the server.
  const latex = (answerLatex || "").trim();
  if (latex) return { text: latex, renderMode: "trusted" };
  return { text: prepareMathDisplay(answer || ""), renderMode: "legacy" };
}

/** Compatibility helper for callers which only need the display string. */
export function pickAnswerDisplayText(
  answer: string,
  answerLatex?: string | null,
): string {
  return pickAnswerDisplayProjection(answer, answerLatex).text;
}

export function pickOptionDisplayProjection(
  content: string,
  contentLatex?: string | null,
): MathDisplayProjection {
  return pickAnswerDisplayProjection(content, contentLatex);
}

/** Compatibility helper for callers which only need the display string. */
export function pickOptionDisplayText(
  content: string,
  contentLatex?: string | null,
): string {
  return pickOptionDisplayProjection(content, contentLatex).text;
}
