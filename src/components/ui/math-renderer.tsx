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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMathText(text: string): string {
  const raw = text.replace(/\\\\/g, "\n");
  const prepared = /\$/.test(raw) ? raw : wrapBareMath(raw);
  const parts: string[] = [];
  let last = 0;
  const re = /\$([^$\n]+?)\$/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(prepared)) !== null) {
    if (m.index > last) {
      parts.push(escapeHtml(prepared.slice(last, m.index)).replace(/\n/g, "<br/>"));
    }
    parts.push(renderSegment(m[1].trim(), false));
    last = m.index + m[0].length;
  }

  if (last < prepared.length) {
    parts.push(escapeHtml(prepared.slice(last)).replace(/\n/g, "<br/>"));
  }

  return parts.join("");
}

export function MathRenderer({ text, className = "", block = false }: MathRendererProps) {
  const html = useMemo(() => renderMathText(text), [text]);
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
