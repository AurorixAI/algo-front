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
  leq: " ≤ ", le: " ≤ ", leqslant: " ≤ ", geq: " ≥ ", ge: " ≥ ", geqslant: " ≥ ",
  neq: " ≠ ", ne: " ≠ ", approx: " ≈ ", equiv: " ≡ ", sim: " ~ ",
  to: " → ", rightarrow: " → ", Rightarrow: " ⇒ ", Leftrightarrow: " ⇔ ", leftarrow: " ← ",
  in: " ∈ ", notin: " ∉ ", cup: " ∪ ", cap: " ∩ ", subset: " ⊂ ", parallel: " ∥ ", perp: " ⊥ ",
  infty: "∞", circ: "°", degree: "°", prime: "'", angle: "∠", triangle: "△",
  ldots: "…", dots: "…", cdots: "…", sum: "∑", prod: "∏", quad: " ", qquad: " ",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", varepsilon: "ε", epsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω",
  Delta: "Δ", Sigma: "Σ", Phi: "Φ", Omega: "Ω", Pi: "Π",
  bmod: " mod ", mod: " mod ",
};

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

/** «$\frac{1}{2}$ м^2» -> «1/2 м в квадрате»; "" for nothing; never throws. */
export function latexToSpeechText(source: string | null | undefined): string {
  if (!source) return "";
  // \$ is a literal dollar: hide it from the delimiter strip, then give it back.
  const delimited = String(source).replace(/\\\$/g, "\u0000");
  const stripped = delimited
    .replace(/\$\$?/g, "")
    .replace(/\\[()[\]]/g, "");
  return convert(stripped)
    .replace(/\u0000/g, "$")
    .replace(/[ \s]+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
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
