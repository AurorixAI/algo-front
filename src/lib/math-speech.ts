/**
 * Plain, speakable text of an answer option for screen readers.
 *
 * The option buttons are drawn with KaTeX (`output: "html"`, aria-hidden glyph spans), so a screen reader finds no
 * name on them.  `latexToSpeechText` turns the option's source (the task's answer text or its LaTeX) into a short
 * readable string - `$\frac{1}{2}$` -> «1/2», `x^2` -> «x в квадрате», `\sqrt{5}` -> «√5» - and `optionAriaLabel`
 * builds «Вариант A: …» from it.  Pure (no React, no DOM): node:test loads this file directly.
 */

const SYMBOLS: Record<string, string> = {
  cdot: " · ", times: " × ", div: " ÷ ", pm: " ± ", mp: " ∓ ",
  lt: " < ", gt: " > ", mid: " | ",
  leq: " ≤ ", le: " ≤ ", leqslant: " ≤ ", geq: " ≥ ", ge: " ≥ ", geqslant: " ≥ ",
  neq: " ≠ ", ne: " ≠ ", approx: " ≈ ", equiv: " ≡ ", sim: " ~ ",
  to: " → ", rightarrow: " → ", longrightarrow: " → ", leftarrow: " ← ", leftrightarrow: " ↔ ",
  Rightarrow: " ⇒ ", Longrightarrow: " ⇒ ", Leftarrow: " ⇐ ", Leftrightarrow: " ⇔ ", iff: " ⇔ ",
  in: " ∈ ", notin: " ∉ ", cup: " ∪ ", cap: " ∩ ", subset: " ⊂ ", setminus: " без ",
  emptyset: "∅", varnothing: "∅", parallel: " ∥ ", perp: " ⊥ ",
  infty: "∞", circ: "°", degree: "°", prime: "'", angle: "∠", triangle: "△",
  ldots: "…", dots: "…", cdots: "…", quad: " ", qquad: " ",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", varrho: "ρ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  bmod: " mod ", mod: " mod ",
};

/** Big operators with limits: «\int_a^b» is read «∫ от a до b». */
const BIG_OPERATORS: Record<string, string> = { int: "∫", iint: "∬", oint: "∮", sum: "∑", prod: "∏" };

/** Commands that only style or wrap their argument: the argument is read, the command is not. */
const WRAPPERS = new Set([
  "text", "textbf", "textit", "textrm", "mathrm", "mathbf", "mathit", "mathsf", "mathbb", "mathcal", "mbox",
  "operatorname", "boldsymbol", "bm", "overline", "underline", "widehat", "widetilde", "hat", "bar", "tilde",
]);

/** Commands that are only layout: dropped, whatever follows is read normally. */
const LAYOUT = new Set([
  "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits", "big", "Big", "bigg", "Bigg",
  "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "Biggl", "Biggr",
]);

/** Function names are read as they are. */
const FUNCTIONS = new Set([
  "sin", "cos", "tan", "tg", "ctg", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "arctg", "arcctg",
  "sinh", "cosh", "tanh", "ln", "log", "lg", "lim", "max", "min", "exp", "det", "gcd",
]);

interface Arg { raw: string; next: number }

/** One LaTeX argument starting at `from`: a balanced `{…}`, one `\command`, or one character. */
function readArg(src: string, from: number): Arg | null {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return null;
  if (src[i] === "{") {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "\\") { j++; continue; } // an escaped brace is not a group border
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) return { raw: src.slice(i + 1, j), next: j + 1 };
    }
    return { raw: src.slice(i + 1), next: src.length }; // an unclosed group: read to the end
  }
  if (src[i] === "\\") {
    const name = /^[a-zA-Z]+/.exec(src.slice(i + 1))?.[0];
    const end = i + 1 + (name ? name.length : 1);
    return { raw: src.slice(i, end), next: end };
  }
  return { raw: src[i], next: i + 1 };
}

/** One factor of a fraction / root / power is an "atom" when it needs no brackets to stay unambiguous. */
const isAtom = (text: string): boolean => /^[√∛]?[\p{L}\p{N}.,°'∞π]+$/u.test(text);
const bracket = (text: string): string => (isAtom(text) ? text : `(${text})`);

function convert(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      const name = /^[a-zA-Z]+/.exec(src.slice(i + 1))?.[0];
      if (!name) {
        const symbol = src[i + 1] ?? "";
        i += 2;
        if (symbol === "\\") out += "; ";                 // \\ - a row break (cases, matrices)
        else if (symbol === "!") out += "";                // negative thin space
        else if (symbol === "," || symbol === ";" || symbol === ":" || symbol === " ") out += " ";
        else out += symbol;                                // \{ \} \% \$ \& \_ \# \|
        continue;
      }
      i += 1 + name.length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const top = readArg(src, i);
        const bottom = top && readArg(src, top.next);
        if (top && bottom) {
          out += `${bracket(convert(top.raw).trim())}/${bracket(convert(bottom.raw).trim())}`;
          i = bottom.next;
        }
      } else if (name === "sqrt") {
        let index = "";
        while (i < src.length && /\s/.test(src[i])) i++;
        if (src[i] === "[") {
          const close = src.indexOf("]", i);
          if (close > i) { index = convert(src.slice(i + 1, close)).trim(); i = close + 1; }
        }
        const arg = readArg(src, i);
        if (arg) {
          const body = convert(arg.raw).trim();
          if (index && index !== "2") out += index === "3" ? `∛${bracket(body)}` : `корень ${index}-й степени из ${body}`;
          else out += `√${bracket(body)}`;
          i = arg.next;
        }
      } else if (name === "binom" || name === "dbinom" || name === "tbinom") {
        const top = readArg(src, i);
        const bottom = top && readArg(src, top.next);
        if (top && bottom) {
          out += `C(${convert(top.raw).trim()}, ${convert(bottom.raw).trim()})`;
          i = bottom.next;
        }
      } else if (name === "color") {
        const arg = readArg(src, i);                       // \color{red} only paints what follows: drop the colour name
        if (arg) i = arg.next;
      } else if (name === "textcolor" || name === "colorbox") {
        const colour = readArg(src, i);                    // \textcolor{red}{x}: read x
        const arg = colour && readArg(src, colour.next);
        if (colour && arg) { out += convert(arg.raw); i = arg.next; }
        else if (colour) i = colour.next;
      } else if (name in BIG_OPERATORS) {
        let lower: string | null = null;
        let upper: string | null = null;
        for (let limit = 0; limit < 2; limit++) {          // _a^b or ^b_a
          let k = i;
          while (k < src.length && /\s/.test(src[k])) k++;
          const mark = src[k];
          if ((mark !== "_" && mark !== "^") || (mark === "_" ? lower !== null : upper !== null)) break;
          const arg = readArg(src, k + 1);
          if (!arg) break;
          if (mark === "_") lower = convert(arg.raw).trim();
          else upper = convert(arg.raw).trim();
          i = arg.next;
        }
        out += ` ${BIG_OPERATORS[name]}${lower ? ` от ${lower}` : ""}${upper ? ` до ${upper}` : ""} `;
      } else if (name === "vec" || name === "overrightarrow") {
        const arg = readArg(src, i);
        if (arg) { out += `вектор ${convert(arg.raw).trim()}`; i = arg.next; }
      } else if (name === "begin" || name === "end") {
        const arg = readArg(src, i);                       // \begin{cases} / \end{cases}: only the environment name
        if (arg) i = arg.next;
      } else if (name === "left" || name === "right") {
        if (src[i] === ".") i++;                           // \left. / \right. - an invisible bracket
      } else if (WRAPPERS.has(name)) {
        const arg = readArg(src, i);
        if (arg) { out += convert(arg.raw); i = arg.next; }
      } else if (FUNCTIONS.has(name)) {
        out += ` ${name}`;
      } else if (name in SYMBOLS) {
        out += SYMBOLS[name];
      } else if (LAYOUT.has(name)) {
        // nothing to read
      }
      // any other command is dropped; its argument, if any, is read as ordinary text
      continue;
    }
    if (ch === "^") {
      const arg = readArg(src, i + 1);
      if (arg) {
        const power = convert(arg.raw).trim();
        if (power === "2") out += " в квадрате ";
        else if (power === "3") out += " в кубе ";
        else if (power === "°" || power === "'") out += power;
        else out += ` в степени ${bracket(power)} `;
        i = arg.next;
        continue;
      }
      i++;
      continue;
    }
    if (ch === "_") {
      const arg = readArg(src, i + 1);
      if (arg) {
        out += `_${bracket(convert(arg.raw).trim())}`;     // x_1, log_2 - the index stays attached
        i = arg.next;
        continue;
      }
      i++;
      continue;
    }
    if (ch === "{" || ch === "}") { i++; continue; }       // a grouping brace - its content stays
    if (ch === "&") { out += " "; i++; continue; }         // a column separator
    out += ch;
    i++;
  }
  return out;
}

/** Delimiters ($, $$, \( \) \[ \]) removed; an escaped dollar is hidden behind a placeholder until `tidy`. */
function stripDelimiters(source: string): string {
  return source.replace(/\\\$/g, "\u0000").replace(/\$\$?/g, "").replace(/\\[()[\]]/g, "");
}

/** Spaces collapsed, no space before closing punctuation or after an opening bracket. */
function tidy(text: string): string {
  return text
    .replace(/\u0000/g, "$")
    .replace(/[\u00a0\s]+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

/**
 * «$\frac{1}{2}$ м^2» -> «1/2 м в квадрате»; "" for nothing.  Never throws (it runs while a page renders): on any error
 * the text is returned stripped of the delimiters, braces and command names.
 */
export function latexToSpeechText(source: string | null | undefined): string {
  if (!source) return "";
  try {
    const stripped = stripDelimiters(String(source));
    try {
      return tidy(convert(stripped));
    } catch {
      return tidy(stripped.replace(/\\[a-zA-Z]+/g, " ").replace(/[{}\\^_&]/g, " "));
    }
  } catch {
    return "";
  }
}

export type OptionPhase = "idle" | "pending" | "confirmed";

/** «Вариант A: 1/2»; a marked-but-not-confirmed option also tells how to confirm it. */
export function optionAriaLabel(letter: string, source: string | null | undefined, phase: OptionPhase = "idle"): string {
  const text = latexToSpeechText(source);
  const base = text ? `Вариант ${letter}: ${text}` : `Вариант ${letter}`;
  return phase === "pending" ? `${base} (отмечен, нажмите ещё раз, чтобы подтвердить)` : base;
}

/** aria-pressed of an option: confirmed = true, the first press (a tick waiting for the second) = mixed. */
export function optionAriaPressed(phase: OptionPhase): boolean | "mixed" {
  return phase === "confirmed" ? true : phase === "pending" ? "mixed" : false;
}
