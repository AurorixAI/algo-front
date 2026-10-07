"use client";

import React, { useMemo } from "react";
import katex from "katex";
import { cn } from "../../lib/utils";

interface MathRendererProps {
  text: string;
  className?: string;
  block?: boolean;
  /**
   * `trusted` is reserved for a server-validated display projection (for
   * example `question_latex` or `answer_latex`).  In that mode the client
   * parses delimiters but never repairs, normalizes, or rewrites the stored
   * LaTeX.  Raw/legacy fields must stay on the default mode.
   */
  renderMode?: MathRenderMode;
}

export type MathRenderMode = "legacy" | "trusted";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanLatexForKatex(latex: string): string {
  if (!latex) return "";

  let s = latex
    .replace(/\\\\([a-zA-Z]+)/g, "\\$1")
    .replace(/\\cdot([a-zA-BD-Z])/g, "\\cdot $1")
    .replace(/\\times([a-zA-Z])/g, "\\times $1")
    .replace(/\\dots([a-zA-Z])/g, "\\dots $1")
    .replace(/\\(le|leq)\s*slant\b/g, "\\leqslant")
    .replace(/\\(ge|geq)\s*slant\b/g, "\\geqslant")
    .replace(/\\le\s+ft\b/g, "\\left")
    .replace(/\\le\s+q\b/g, "\\leq")
    .replace(/\\ge\s+q\b/g, "\\geq")
    .replace(/\\ne\s+q\b/g, "\\neq")
    .replace(/\\ne\s+g\b/g, "\\neg")
    .replace(/\\pm\s+od\b/g, "\\pmod");

  // Fix \dfrac inside superscripts (^) and subscripts (_) where \dfrac forces \displaystyle and breaks exponent alignment
  // e.g. x^{\dfrac{5}{6}} -> x^{\frac{5}{6}}
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "^" || s[i] === "_") {
      out.push(s[i]);
      i++;
      if (i < s.length && s[i] === "{") {
        out.push("{");
        i++;
        let depth = 1;
        while (i < s.length && depth > 0) {
          if (s.startsWith("\\dfrac", i)) {
            out.push("\\frac");
            i += 6;
          } else if (s[i] === "{") {
            depth++;
            out.push("{");
            i++;
          } else if (s[i] === "}") {
            depth--;
            out.push("}");
            i++;
          } else {
            out.push(s[i]);
            i++;
          }
        }
      } else if (s.startsWith("\\dfrac", i)) {
        out.push("\\frac");
        i += 6;
      }
      continue;
    } else {
      out.push(s[i]);
      i++;
    }
  }
  return out.join("");
}

function katexRender(
  latex: string,
  displayMode: boolean,
  renderMode: MathRenderMode,
): string {
  try {
    // The browser has historically repaired malformed legacy fragments before
    // giving them to KaTeX.  That must never happen to an audited projection:
    // a rendering helper is not allowed to silently change its mathematical
    // meaning.  Tokenization below still recognises delimiters in both modes.
    const prepared = renderMode === "trusted"
      ? latex
      : wrapBareCyrillicInMath(cleanLatexForKatex(latex.trim()));
    return katex.renderToString(prepared, {
      throwOnError: false,
      displayMode,
      output: "html",
      strict: "ignore",
      trust: false,
    });
  } catch (e) {
    return escapeHtml(latex);
  }
}

// KaTeX math mode silently swallows spaces between Cyrillic letters, gluing
// prose words together ("функция возрастает" → "функциявозрастает"). Runs of
// bare Cyrillic inside a formula are therefore promoted to \text{...}, where
// spaces are preserved. Existing \text{...} blocks are copied verbatim.
function wrapBareCyrillicInMath(latex: string): string {
  if (!/[А-Яа-яЁё]/.test(latex)) return latex;

  const wrapRuns = (chunk: string): string =>
    chunk.replace(/[А-Яа-яЁё][А-Яа-яЁё\s.,;:!?()«»"'\-−]*/g, (run) => `\\text{${run}}`);

  const textBlock = /\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|operatorname|textbf|textit)\{[^{}]*\}/g;
  let out = "";
  let cursor = 0;
  for (const match of latex.matchAll(textBlock)) {
    out += wrapRuns(latex.slice(cursor, match.index)) + match[0];
    cursor = match.index + match[0].length;
  }
  out += wrapRuns(latex.slice(cursor));
  return out;
}

export interface Token {
  type: "text" | "inline" | "display";
  content: string;
}

function isStandaloneMath(tokens: Token[]): boolean {
  const nonEmpty = tokens.filter((token) => !(token.type === "text" && token.content.trim() === ""));
  return nonEmpty.length === 1 && nonEmpty[0].type === "display";
}

const MATH_COMMANDS =
  "log|lg|ln|frac|dfrac|cfrac|sqrt|sin|cos|tan|cot|arcsin|arccos|arctan|" +
  "lim|sum|prod|int|pm|mp|cdot|times|div|alpha|beta|gamma|delta|epsilon|" +
  "theta|lambda|mu|pi|rho|sigma|tau|phi|varphi|chi|psi|omega|" +
  "Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|infty|" +
  "cup|cap|in|notin|subset|subseteq|supset|supseteq|" +
  "leq|geq|neq|approx|equiv|forall|exists|partial|nabla|" +
  "rightarrow|Rightarrow|leftarrow|Leftarrow|leftrightarrow|Leftrightarrow|" +
  "vec|hat|bar|tilde|dot|ddot|" +
  "text|mathbf|mathit|mathrm|mathbb|mathcal";

const BARE_LATEX_REGEX = new RegExp(
  "\\\\{1,2}(?:" + MATH_COMMANDS + ")" +
  "(?:" +
    "(?:_|\\^)(?:\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}|[a-zA-Z0-9]+)|" +
    "\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}|" +
    "\\([^()]*\\)" +
  ")*",
  "g"
);

function cleanNestedDollars(text: string): string {
  if (!text) return "";
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      depth++;
      out += c;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      out += c;
    } else if (c === "$" && depth > 0) {
      continue;
    } else {
      out += c;
    }
  }
  for (let step = 0; step < 3; step++) {
    out = out.replace(/(\\[a-zA-Z]+(?:_[a-zA-Z0-9]+|_{[^{}]*})?\s*\([^\)]*?)\$([^\$\n]+?)\$([^\)]*?\))/g, "$1$2$3");
  }
  return out;
}

export function tokenize(rawS: string, renderMode: MathRenderMode = "legacy"): Token[] {
  // `cleanNestedDollars` is a legacy recovery routine.  Calling it for a
  // trusted projection could remove meaningful characters from a valid,
  // server-reviewed expression, so it is intentionally bypassed there.
  const s = renderMode === "trusted" ? (rawS || "") : cleanNestedDollars(rawS || "");
  if (!s) return [];

  // If the entire string is pure LaTeX without delimiters (e.g. "\frac{\sqrt{3}}{2}" or "7^{\log_5 x^2}")
  if (!s.includes("$") && !s.includes("\\[") && !s.includes("\\(")) {
    const hasCyrillic = /[\u0400-\u04FF]/.test(s);
    const hasLatex = /\\{1,2}[a-zA-Z]+|\^\{|_\{|\^[0-9a-zA-Z]|_[0-9a-zA-Z]/.test(s);
    if (!hasCyrillic && hasLatex) {
      return [{ type: "inline", content: s.trim() }];
    }
    if (/^\s*\\{1,2}[a-zA-Z]/.test(s)) {
      return [{ type: "inline", content: s.trim() }];
    }
  }

  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("\\[", i)) {
      const end = s.indexOf("\\]", i + 2);
      if (end !== -1) {
        tokens.push({ type: "display", content: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (s.startsWith("\\(", i)) {
      const end = s.indexOf("\\)", i + 2);
      if (end !== -1) {
        tokens.push({ type: "inline", content: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (s.startsWith("$$", i)) {
      const end = s.indexOf("$$", i + 2);
      if (end !== -1) {
        tokens.push({ type: "display", content: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (s[i] === "$") {
      const end = s.indexOf("$", i + 1);
      if (end !== -1) {
        tokens.push({ type: "inline", content: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      } else {
        const remaining = s.slice(i + 1).trim();
        if (/[\\[\]{}^_+\-=]/.test(remaining)) {
          tokens.push({ type: "inline", content: remaining });
          break;
        }
        tokens.push({ type: "text", content: "$" });
        i++;
        continue;
      }
    }

    const searchSlice = s.slice(i);
    const nextMathRel = searchSlice.slice(1).search(/\$|\\[\[(]/);
    const textEnd = nextMathRel === -1 ? s.length : i + 1 + nextMathRel;
    const textSegment = s.slice(i, textEnd);

    // Extract any bare LaTeX expressions within plain text segment
    BARE_LATEX_REGEX.lastIndex = 0;
    let pos = 0;
    let match: RegExpExecArray | null;
    while ((match = BARE_LATEX_REGEX.exec(textSegment)) !== null) {
      if (match.index > pos) {
        tokens.push({ type: "text", content: textSegment.slice(pos, match.index) });
      }
      tokens.push({ type: "inline", content: match[0] });
      pos = BARE_LATEX_REGEX.lastIndex;
      if (match[0].length === 0) {
        BARE_LATEX_REGEX.lastIndex++;
      }
    }
    if (pos < textSegment.length) {
      tokens.push({ type: "text", content: textSegment.slice(pos) });
    }

    i = Math.max(i + 1, textEnd);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Line-break control
//
// KaTeX allows a break only after a top-level relation / binary operator
// (TeX rule), never inside fractions, roots, scripts or \left..\right groups.
// One gap remains: plain "(" ... ")" is not a TeX group, so "(a+b)" could break
// at the "+".  `keepParenthesesTogether` merges those chunks back.
// ---------------------------------------------------------------------------

const SPAN_OR_TEXT = /<(\/?)span\b[^>]*>|<[^>]*>|[^<]+/g;

// A parenthesised group stays in one piece only while it is short.  Longer runs
// get a break point after each inner operator again (as plain KaTeX does), so a
// long "(a+b)(c+d)..." cannot become wider than a phone screen.
const MAX_UNBREAKABLE_CHARS = 10;
// A glued "word" (formula + adjacent text/formulas) longer than this is not
// glued at all: it would be wider than a phone screen and could not wrap.
const MAX_GLUED_WORD_CHARS = 18;

/** Visible characters of the formula part that touches its neighbours. */
function glueLength(html: string): number {
  const at = html.indexOf('<span class="katex-html"');
  if (at === -1) return 0;
  const parts = html.slice(at).split("<wbr>").map((p) => p.replace(/<[^>]*>/g, "").length);
  return Math.max(parts[0], parts[parts.length - 1]);
}

export function keepParenthesesTogether(html: string): string {
  const marker = '<span class="katex-html"';
  const at = html.indexOf(marker);
  if (at === -1) return html;
  const bodyStart = html.indexOf(">", at) + 1;

  // Collect top-level (depth 1) <span class="base"> chunks of .katex-html.
  const chunks: { open: number; openEnd: number; close: number; delta: number; len: number }[] = [];
  let depth = 1;
  let cur: { open: number; openEnd: number; close: number; delta: number; len: number } | null = null;
  SPAN_OR_TEXT.lastIndex = bodyStart;
  let m: RegExpExecArray | null;
  while ((m = SPAN_OR_TEXT.exec(html)) !== null) {
    const tok = m[0];
    if (tok.startsWith("<span")) {
      if (depth === 1 && /class="base"/.test(tok)) {
        cur = { open: m.index, openEnd: m.index + tok.length, close: -1, delta: 0, len: 0 };
      }
      depth++;
    } else if (tok === "</span>") {
      depth--;
      if (depth === 0) break;
      if (depth === 1 && cur) {
        cur.close = m.index;
        chunks.push(cur);
        cur = null;
      }
    } else if (!tok.startsWith("<") && cur) {
      cur.len += tok.replace(/\s/g, "").length;
      for (const ch of tok) {
        if (ch === "(" || ch === "[") cur.delta++;
        else if (ch === ")" || ch === "]") cur.delta--;
      }
    }
  }
  if (chunks.length < 2) return html;

  // Walk the boundaries between consecutive chunks: inside an open bracket the
  // two chunks are merged; otherwise an explicit <wbr> marks the (only) legal
  // break point, so glued groups can use white-space: nowrap everywhere else.
  let open = 0;
  let run = 0; // visible characters since the last break point
  let out = "";
  let pos = 0;
  for (let k = 0; k < chunks.length - 1; k++) {
    open = Math.max(0, open + chunks[k].delta);
    run += chunks[k].len;
    const closeEnd = chunks[k].close + "</span>".length;
    if (html.slice(closeEnd, chunks[k + 1].open).length !== 0) continue;
    if (open > 0 && run + chunks[k + 1].len <= MAX_UNBREAKABLE_CHARS) {
      out += html.slice(pos, chunks[k].close);
      pos = chunks[k + 1].openEnd;
    } else {
      out += html.slice(pos, closeEnd) + "<wbr>";
      pos = closeEnd;
      run = 0;
    }
  }
  return out + html.slice(pos);
}

type Atom =
  | { kind: "ws"; html: string; hard: boolean }
  | { kind: "txt"; html: string; raw: string }
  | { kind: "math"; html: string; content: string; len: number }
  | { kind: "block"; html: string };

// A numeric formula such as $10$, $12{,}3$, $-5$ ...
const NUMERIC_MATH = /^\s*[−\-+]?\s*\d[\d\s{},.]*\s*$/;
// ... followed by a short unit word that must stay on the same line.
const UNIT_WORD =
  /^(?:мкм|мм|см|дм|км|м|мг|кг|г|ц|т|мл|л|с|сек|мин|ч|%|°|руб(?:\.|л[а-яё]*)?|коп\.?|шт\.?|Гц|Н|Дж|Вт|Ом|рад|град[а-яё]*|м\/с|км\/ч)(?![A-Za-zА-Яа-яЁё])/u;

/**
 * Join into one non-breaking word every math span with the characters it
 * touches ("см$^{2}$", "$x$,", "($a$)"), a script-only formula with the word
 * before it, and a numeric formula with its unit ("$12{,}3$ см").
 */
function glueAtoms(atoms: Atom[], renderMode: MathRenderMode): string {
  const out: string[] = [];
  let word: Atom[] = [];
  const flush = () => {
    if (word.length === 0) return;
    const html = word.map((a) => a.html).join("");
    const hasMath = word.some((a) => a.kind === "math");
    const len = word.reduce((n, a) => n + (a.kind === "math" ? a.len : a.kind === "txt" ? a.raw.length : 0), 0);
    out.push(hasMath && word.length > 1 && len <= MAX_GLUED_WORD_CHARS ? `<span class="math-glue">${html}</span>` : html);
    word = [];
  };
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (a.kind === "ws") {
      const prev = word[word.length - 1];
      const next = atoms[i + 1];
      if (prev && next && !a.hard) {
        // "см $^{2}$": a script never starts a line
        if (next.kind === "math" && /^\s*[\^_]/.test(next.content)) {
          if (renderMode === "trusted") word.push(a);
          continue;
        }
        // "$12{,}3$ см": number and unit stay together
        if (prev.kind === "math" && NUMERIC_MATH.test(prev.content) && next.kind === "txt" && UNIT_WORD.test(next.raw)) {
          word.push(a);
          continue;
        }
      }
      flush();
      out.push(a.html);
    } else if (a.kind === "block") {
      flush();
      out.push(a.html);
    } else {
      word.push(a);
    }
  }
  flush();
  return out.join("");
}

export function renderMathText(
  text: string,
  allowLineBreaks = false,
  renderMode: MathRenderMode = "legacy",
): string {
  const s = renderMode === "trusted" ? (text || "") : text.trim();
  if (!s) return "";

  const tokens = tokenize(s, renderMode);
  const atoms: Atom[] = [];

  for (const token of tokens) {
    if (token.type === "text") {
      for (const piece of token.content.split(/(\s+)/)) {
        if (!piece) continue;
        const escaped = escapeHtml(piece);
        if (/^\s+$/.test(piece)) {
          const hard = allowLineBreaks && piece.includes("\n");
          atoms.push({
            kind: "ws",
            hard,
            html: allowLineBreaks ? escaped.replace(/\n/g, "<br/>") : escaped.replace(/\n/g, " "),
          });
        } else {
          atoms.push({ kind: "txt", html: escaped, raw: piece });
        }
      }
    } else if (allowLineBreaks && token.type === "display") {
      atoms.push({ kind: "block", html: keepParenthesesTogether(katexRender(token.content, true, renderMode)) });
    } else {
      const html = keepParenthesesTogether(katexRender(token.content, false, renderMode));
      atoms.push({ kind: "math", content: token.content, html, len: glueLength(html) });
    }
  }
  return glueAtoms(atoms, renderMode);
}

export function MathRenderer({
  text,
  className = "",
  block = false,
  renderMode = "legacy",
}: MathRendererProps) {
  const html = useMemo(() => renderMathText(text, block, renderMode), [text, block, renderMode]);
  const standalone = useMemo(
    () => isStandaloneMath(tokenize(renderMode === "trusted" ? text : text.trim(), renderMode)),
    [text, renderMode],
  );
  const Tag = block ? "div" : "span";
  return (
    <Tag
      className={cn(
        "math-renderer leading-relaxed antialiased no-scrollbar",
        block && "math-block",
        "[&_.katex]:text-[1.06em] [&_.katex]:font-normal",
        block
          ? (standalone
              ? "block mx-auto max-w-full overflow-x-auto overflow-y-hidden text-center [&_.katex-display]:my-2.5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
              : "block min-w-0 max-w-full overflow-x-auto overflow-y-hidden [&_.katex-display]:my-2.5 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden")
          : "inline [&_.katex]:inline",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({
  text,
  className,
  renderMode = "legacy",
}: {
  text: string;
  className?: string;
  renderMode?: MathRenderMode;
}) {
  return <MathRenderer text={text} className={className} block renderMode={renderMode} />;
}
