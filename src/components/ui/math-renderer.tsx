"use client";

import { useMemo } from "react";
import katex from "katex";
import { wrapBareMath } from "@/lib/math-display";

interface MathRendererProps {
  text: string;
  className?: string;
  block?: boolean;
}

function renderSegment(segment: string, display: boolean): string {
  try {
    return katex.renderToString(segment, {
      throwOnError: false,
      displayMode: display,
      output: "html",
      strict: "ignore",
    });
  } catch {
    return segment;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\quad/g, " ")
    .replace(/\\qquad/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders a single $…$ LaTeX block that mixes \text{} and math.
 * Splits on \text{…} boundaries so the text portions are regular
 * HTML (word-wrappable) while actual math renders via KaTeX inline.
 */
function renderMixedLatexBlock(inner: string): string {
  const parts: string[] = [];
  const textRe = /\\text\{([^}]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = textRe.exec(inner)) !== null) {
    // Math fragment before this \text{…}
    if (m.index > last) {
      const mathFrag = inner.slice(last, m.index).trim();
      if (mathFrag) parts.push(renderSegment(mathFrag, false));
    }
    // Text fragment — rendered as plain escaped HTML
    parts.push(escapeHtml(m[1]));
    last = m.index + m[0].length;
  }

  // Trailing math after last \text{…}
  if (last < inner.length) {
    const mathFrag = inner.slice(last).trim();
    if (mathFrag) parts.push(renderSegment(mathFrag, false));
  }

  return parts.join("");
}

/**
 * Converts bare Cyrillic text inside a LaTeX $…$ block into \text{…}.
 * In raw LaTeX without \text{}, KaTeX treats Cyrillic characters as math
 * variables, ignores spaces, and squishes all words together.
 */
function normalizeLatexInner(inner: string): string {
  if (!/[а-яА-ЯёЁ]/.test(inner)) return inner;
  return inner.replace(
    /(?:\\text\{[^}]*\}|([а-яА-ЯёЁ][а-яА-ЯёЁ\s.,!?:;–—\-]*[а-яА-ЯёЁа-яА-ЯёЁ.,!?:;–—\-]?))/g,
    (match, bareCyr) => {
      if (bareCyr) {
        return `\\text{${bareCyr}}`;
      }
      return match;
    },
  );
}

function renderMathText(text: string, allowLineBreaks = false): string {
  // Normalize double $$ display math delimiters to single $
  let cleaned = text.replace(/\$\$/g, "$");
  // Trim outer duplicate $ if wrapped twice
  cleaned = cleaned.replace(/^\$\s*(\$[^$]+\$)\s*\$$/, "$1");

  const prepared = /\$/.test(cleaned) ? cleaned : wrapBareMath(cleaned);
  const parts: string[] = [];
  let last = 0;

  const newlineReplace = allowLineBreaks
    ? (s: string) => escapeHtml(s).replace(/\n/g, "<br/>")
    : (s: string) => escapeHtml(s).replace(/\n/g, " ");

  // Multi-line $…$ match (handles entire string being one math block)
  const re = /\$([^$]+?)\$/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(prepared)) !== null) {
    if (m.index > last) {
      parts.push(newlineReplace(prepared.slice(last, m.index)));
    }
    let inner = m[1].trim();
    inner = normalizeLatexInner(inner);
    // If the block mixes \text{} and math, split it into readable segments
    if (/\\text\{/.test(inner)) {
      parts.push(renderMixedLatexBlock(inner));
    } else {
      parts.push(renderSegment(inner, false));
    }
    last = m.index + m[0].length;
  }

  if (last < prepared.length) {
    parts.push(newlineReplace(prepared.slice(last)));
  }

  return parts.join("");
}

export function MathRenderer({ text, className = "", block = false }: MathRendererProps) {
  const html = useMemo(() => renderMathText(text, block), [text, block]);
  const Tag = block ? "div" : "span";

  return (
    <Tag
      className={`math-renderer leading-relaxed [&_.katex]:text-[1.05em] ${block ? "block" : ""} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function MathText({ text, className }: { text: string; className?: string }) {
  return <MathRenderer text={text} className={className} block />;
}
