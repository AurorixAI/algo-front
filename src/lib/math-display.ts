/**
 * Math display helpers — KaTeX-ready strings for MathRenderer.
 * Prefer server-provided `*_latex` fields; fallback wraps bare LaTeX locally.
 */

/** Extract `\frac{…}{…}` / `\sqrt{…}` with balanced braces. */
export function extractBracedCommand(
  s: string,
  start: number,
  command: string,
): { text: string; end: number } | null {
  if (!s.startsWith(command, start)) return null;
  let i = start + command.length;
  const readGroup = (): string | null => {
    if (s[i] !== "{") return null;
    let depth = 0;
    const begin = i;
    for (; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return s.slice(begin, i);
        }
      }
    }
    return null;
  };
  const g1 = readGroup();
  if (!g1) return null;
  const g2 = command === "\\frac" ? readGroup() : "";
  if (command === "\\frac" && !g2) return null;
  return { text: command + g1 + (g2 || ""), end: i };
}

export function normalizeMathExponents(s: string): string {
  return s
    .replace(/\^(\d+)/g, "^{$1}")
    .replace(/\^([a-zA-Z])/g, "^{$1}");
}

function wrapMathSegment(expr: string): string {
  return `$${normalizeMathExponents(expr.trim())}$`;
}

function hasCyrillicProse(s: string): boolean {
  return /[а-яё]{5,}/i.test(s);
}

function looksLikeMathExpr(s: string): boolean {
  const t = s.trim();
  if (!t || hasCyrillicProse(t)) return false;
  return /[\^=±√\\]|[a-zA-Z]\s*[\d(]|\([^)]+\)\s*\^|\d\s*[a-zA-Z]|[+\-·*/]\s*[\d(a-zA-Z]/.test(
    t,
  );
}

function wrapParenPowerSegments(s: string): string {
  return s.replace(
    /(\(\s*[^()]+?\s*\)\s*\^(?:\{[^}]+\}|\d+|[a-zA-Z]))/g,
    (m) => (m.includes("$") ? m : wrapMathSegment(m)),
  );
}

function wrapIdentifierPowerSegments(s: string): string {
  return s.replace(
    /(?<![$\\w])([a-zA-Z][\w.,]*\s*\^(?:\{[^}]+\}|\d+|[a-zA-Z])|[\d.,]+\s*\^(?:\{[^}]+\}|\d+))/g,
    (m) => (m.includes("$") ? m : wrapMathSegment(m)),
  );
}

/**
 * LaTeX commands that require wrapping in $…$ for KaTeX.
 * Covers structural commands (\frac, \sqrt), text mode (\text),
 * trig/log functions, Greek letters, set/interval notation, and more.
 */
const BARE_LATEX_COMMANDS = [
  "\\frac",
  "\\sqrt",
] as const;

/**
 * Regex that detects any bare LaTeX command suffix that should trigger
 * full-string wrapping (i.e. the entire value is a math expression).
 */
const LATEX_COMMAND_RE =
  /\\(?:text|cos|sin|tan|cot|sec|csc|log|ln|lim|exp|max|min|sup|inf|det|deg|arg|left|right|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|sum|prod|int|oint|nabla|partial|infty|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|in|notin|subset|supset|cup|cap|emptyset|forall|exists|neg|wedge|vee|to|Rightarrow|Leftrightarrow|mathbb|mathbf|mathrm|overline|underline|hat|vec|dot|ddot|tilde|bar)(?![a-zA-Z])/;

/** Wrap bare LaTeX commands in $…$ for KaTeX (supports nested braces). */
export function wrapBareMath(text: string): string {
  let s = text.trim();
  if (!s) return s;
  // Already wrapped — return as-is
  if (/\$[^$]+\$/.test(s)) return s;

  // If the whole string is a known LaTeX expression, wrap entirely
  if (LATEX_COMMAND_RE.test(s)) {
    return `$${normalizeMathExponents(s)}$`;
  }

  const commands = Array.from(BARE_LATEX_COMMANDS);
  let out = "";
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (const cmd of commands) {
      const chunk = extractBracedCommand(s, i, cmd);
      if (chunk) {
        out += `$${chunk.text}$`;
        i = chunk.end;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const eqMatch = s
      .slice(i)
      .match(
        /^([\d.,]*\s*[a-zA-Z]?(?:\^\{?[^}\s]+)?(?:\s*[\+\-·\*\/]\s*[\d.,a-zA-Z^{}\(\)\\sqrt\s]+)+\s*=\s*[\d.,a-zA-Z^{}\(\)\\sqrt\s+\-]+)/,
      );
    if (eqMatch) {
      const eq = eqMatch[1];
      out += `$${normalizeMathExponents(eq.replace(/,\s*(\d)/g, ".$1"))}$`;
      i += eq.length;
      continue;
    }

    out += s[i];
    i++;
  }
  s = out;

  s = wrapParenPowerSegments(s);
  s = wrapIdentifierPowerSegments(s);

  if (!/\$/.test(s) && looksLikeMathExpr(s)) {
    return wrapMathSegment(s);
  }

  return s;
}

export function pickAnswerDisplayText(
  answer: string,
  answerLatex?: string | null,
): string {
  const latex = (answerLatex || "").trim();
  if (latex) return latex;
  const a = (answer || "").trim();
  if (!a) return "";
  // Already contains KaTeX delimiters
  if (/\$/.test(a)) return a;
  // Detect any LaTeX content: backslash commands, math operators, Greek letters
  if (
    /[=±√\^]/.test(a) ||
    /x\s*=/.test(a) ||
    LATEX_COMMAND_RE.test(a) ||
    /\\(?:frac|sqrt)/.test(a)
  ) {
    return wrapBareMath(a);
  }
  return a;
}

export function pickOptionDisplayText(
  content: string,
  contentLatex?: string | null,
): string {
  return pickAnswerDisplayText(content, contentLatex);
}
