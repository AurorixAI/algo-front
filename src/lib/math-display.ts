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

export function prepareMathDisplay(text: string): string {
  return wrapBareMath(text);
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

export function pickAnswerDisplayText(
  answer: string,
  answerLatex?: string | null,
): string {
  // Content-service owns mathematical normalization.  A client-side rewrite
  // can change the meaning of a value (for example a fraction or decimal), so
  // the UI renders the stored display projection verbatim and only falls back
  // to raw text when legacy data is incomplete.
  return (answerLatex || answer || "").trim();
}

export function pickOptionDisplayText(
  content: string,
  contentLatex?: string | null,
): string {
  return pickAnswerDisplayText(content, contentLatex);
}
