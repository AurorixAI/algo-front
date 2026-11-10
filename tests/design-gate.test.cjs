// Design-system gate (waves 0-1): the counters of the audit (artifacts/analysis/DESIGN_SYSTEM_AUDIT.md §6) can only go DOWN.  A ceiling is the number found when the wave was made; a wave that lowers a counter
// lowers its ceiling in the same commit (the test says so when the real number is below the ceiling), a change that raises it fails.  Also: the dead classes of Tailwind v4 are gone, and the tokens of
// tailwind.config.ts and src/styles/tokens.css say the same.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
})(SRC);
const rel = (file) => path.relative(SRC, file).split(path.sep).join("/");
const sources = files.map((file) => ({ file: rel(file), text: fs.readFileSync(file, "utf8") }));
const count = (pattern, skip = () => false) => sources.reduce((sum, { file, text }) => sum + (skip(file) ? 0 : (text.match(pattern) || []).length), 0);

// The only places where a glass / gradient look may stay until wave 5: the screens of a child solving an exam (/e, /d, /diagnostic) and their own components.
const STUDENT_EXAM_SURFACE_RE = /^(app\/(e|d|diagnostic)\/|components\/exam\/|components\/ui\/(test-background|test-header|question-card|option-grid|text-input-answer|analyzing-toast|slider)\.tsx$)/;
const STUDENT_EXAM_SURFACE = (file) => STUDENT_EXAM_SURFACE_RE.test(file);

const CEILINGS = {
  // [name, regexp, skip, ceiling]
  tinyText: ["text-[9px|10px|11px] (nothing under 12 px)", /text-\[(9|10|11)px\]/g, undefined, 232],
  text13: ["text-[13px]", /text-\[13px\]/g, undefined, 43],
  lightText: ["text-slate-300/400 as a text colour", /\btext-slate-(300|400)\b/g, undefined, 206],
  hexClass: ["a hex colour inside a class", /\b(bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|decoration|divide|placeholder|accent|caret)-\[#[0-9a-fA-F]{3,8}\]/g, undefined, 0],
  gradient: ["bg-gradient-* outside the exam surfaces", /\bbg-gradient-to-[a-z]+\b/g, STUDENT_EXAM_SURFACE, 0],
  filledButton: ["a hand-made <button> with a coloured fill (use Button)", /<button\b[^>]*?className="[^"]*\bbg-(?:primary|blue|emerald|green|rose|red|indigo|slate-900|amber)-\d00\b[^"]*\btext-white\b/g, undefined, 2],
  framedButton: ["a hand-made <button> with a frame, a white fill and padding (use Button)", /<button\b[^>]*?className="(?=[^"]*\bborder\b)(?=[^"]*\bbg-white\b)(?=[^"]*\bpx-\d)[^"]*"/g, undefined, 3],
  dashedEmpty: ["border-dashed (a hand-made empty state: use EmptyState)", /\bborder-dashed\b/g, undefined, 22],
  gradientStops: ["a gradient stop (from- / via- / to- colour) outside the exam surfaces", /\b(?:from|via)-(?:[a-z]+-\d{2,3}|white|transparent)\b/g, STUDENT_EXAM_SURFACE, 0],
  blur: ["backdrop-blur outside the exam surfaces", /\bbackdrop-blur(-[a-z0-9]+)?\b/g, STUDENT_EXAM_SURFACE, 22],
};

for (const [key, [name, pattern, skip, ceiling]] of Object.entries(CEILINGS)) {
  test(`gate: ${name} only goes down (ceiling ${ceiling})`, () => {
    const found = count(pattern, skip);
    assert.ok(found <= ceiling, `${name}: ${found} found, the ceiling is ${ceiling} - a change must not add them (${key})`);
    if (found < ceiling) assert.fail(`${name}: ${found} found, below the ceiling ${ceiling} - lower the ceiling in tests/design-gate.test.cjs to ${found}`);
  });
}

test("dead classes of Tailwind v4 (shadow-xs, shadow-2xs, border-3) do not exist in the source", () => {
  const found = [];
  for (const { file, text } of sources) if (/\b(shadow-(2xs|xs)|border-3)\b/.test(text)) found.push(file);
  assert.deepEqual(found, [], "Tailwind 3.4 has no such classes: they draw nothing");
});

function loadConfig() {
  const ts = require("typescript");
  const source = fs.readFileSync(path.join(__dirname, "..", "tailwind.config.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", code)(mod, mod.exports, (name) => require(name));
  return { config: mod.exports.default, SHADOW_CARD: mod.exports.SHADOW_CARD, SHADOW_POP: mod.exports.SHADOW_POP };
}

test("the shadow scale has two levels: card and pop; every older name is one of them", () => {
  const { config, SHADOW_CARD, SHADOW_POP } = loadConfig();
  const shadows = config.theme.extend.boxShadow;
  assert.equal(shadows.card, SHADOW_CARD);
  assert.equal(shadows.pop, SHADOW_POP);
  assert.deepEqual([...new Set(Object.values(shadows))].sort(), [SHADOW_CARD, SHADOW_POP].sort());
});

test("the seven colour roles exist and the red is only rose", () => {
  const { config } = loadConfig();
  const colors = config.theme.extend.colors;
  for (const role of ["neutral", "accent", "success", "warning", "danger", "info", "muted"]) assert.ok(colors[role], `role ${role}`);
  assert.equal(colors.danger[600], "#e11d48");
  assert.equal(colors.success[700], "#047857");
});

test("the type scale is 12 / 14 / 16 / 20 / 24 / 30 px", () => {
  const { config } = loadConfig();
  const sizes = Object.values(config.theme.extend.fontSize).map(([size]) => parseFloat(size) * 16);
  assert.deepEqual(sizes, [12, 14, 16, 20, 24, 30]);
});

test("tokens.css repeats the values of tailwind.config.ts (one source of truth, two readers)", () => {
  const { config, SHADOW_CARD, SHADOW_POP } = loadConfig();
  const css = fs.readFileSync(path.join(SRC, "styles", "tokens.css"), "utf8");
  const var_ = (name) => { const hit = css.match(new RegExp(`${name}:\\s*([^;]+);`)); assert.ok(hit, `${name} in tokens.css`); return hit[1].trim(); };
  assert.equal(var_("--shadow-card"), SHADOW_CARD);
  assert.equal(var_("--shadow-pop"), SHADOW_POP);
  const radius = config.theme.extend.borderRadius;
  for (const key of ["tag", "control", "card", "modal"]) assert.equal(var_(`--radius-${key}`), radius[key], `radius ${key}`);
  const heights = config.theme.extend.height;
  assert.equal(var_("--control-h"), heights.control);
  assert.equal(var_("--control-h-sm"), heights["control-sm"]);
  assert.equal(var_("--control-h-lg"), heights["control-lg"]);
  assert.match(css, /html\[data-density="touch"\][^}]*--control-h-touch:\s*2\.75rem/);
});

test("the CSS of the project builds the token classes (a class that is not in the build draws nothing)", () => {
  const { execFileSync } = require("node:child_process");
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "algo-tokens-"));
  const out = path.join(dir, "tw.css");
  execFileSync(process.execPath, [path.join(__dirname, "..", "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(SRC, "app", "globals.css"), "-o", out], { cwd: path.join(__dirname, ".."), stdio: "pipe" });
  const css = fs.readFileSync(out, "utf8");
  for (const cls of [".shadow-card", ".shadow-pop", ".rounded-tag", ".min-h-control", ".text-success-700", ".bg-danger-600"]) assert.ok(css.includes(cls + " {") || css.includes(cls + "{") || css.includes(cls + ","), `${cls} is built`);
  assert.ok(css.includes("--control-h-touch"), "tokens.css is part of the build");
});

// ── contrast of the text pairs of the tokens (WCAG AA, 4.5:1) ─────────────────────────────────────────────
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("warm neutrals: the text pairs of the tokens keep 4.5:1 (primary / secondary / muted on the page and on a white surface; the accent; white on the fills)", () => {
  const { config } = loadConfig();
  const mod = (() => { const ts = require("typescript"); const src = fs.readFileSync(path.join(__dirname, "..", "tailwind.config.ts"), "utf8"); const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText; const m = { exports: {} }; new Function("module", "exports", "require", out)(m, m.exports, require); return m.exports; })();
  const N = mod.NEUTRAL, BG = mod.PAGE_BG, WHITE = "#ffffff", colors = config.theme.extend.colors;
  const pairs = [
    ["primary text 900 on page", N[900], BG], ["primary text 900 on surface", N[900], WHITE],
    ["body text 700 on page", N[700], BG], ["body text 700 on surface", N[700], WHITE],
    ["secondary text 600 on page", N[600], BG], ["secondary text 600 on surface", N[600], WHITE],
    ["muted 500 on page", colors.muted.DEFAULT, BG], ["muted 500 on surface", colors.muted.DEFAULT, WHITE], ["muted 500 on a zone (neutral 50)", colors.muted.DEFAULT, N[50]],
    ["link primary-700 on page", colors.accent[700], BG], ["white on primary-600", WHITE, colors.accent[600]],
    ["white on danger-600", WHITE, colors.danger[600]], ["white on success-700", WHITE, colors.success[700]],
    ["warning-900 on warning-50", colors.warning[900], colors.warning[50]], ["info-900 on info-50", colors.info[900], colors.info[50]],
  ];
  const bad = pairs.filter(([, fg, bg]) => contrast(fg, bg) < 4.5).map(([name, fg, bg]) => `${name}: ${contrast(fg, bg).toFixed(2)}`);
  assert.deepEqual(bad, []);
  assert.deepEqual(colors.slate, mod.NEUTRAL, "slate IS the neutral palette: one grey in one place");
  assert.equal(BG, "#f7f7f5");
  // the page background of the CSS follows the token
  assert.match(fs.readFileSync(path.join(SRC, "styles", "tokens.css"), "utf8"), /--color-bg: #f7f7f5;/);
});

// No native browser tooltip («Please fill out this field.») anywhere: every <form> is noValidate, the checks and the words are ours.
test("gate: every <form> is noValidate (the browser's own English hints are never shown) - ceiling 0", () => {
  const roots = [SRC, path.join(__dirname, "..", "console", "src")];
  const bad = [];
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(full); continue; }
      if (!/\.tsx$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const m of text.matchAll(/<form\b/g)) {
        if (/^\s*(\*|\/\/|\{\/\*)/.test(text.slice(text.lastIndexOf("\n", m.index) + 1, m.index))) continue; // a comment, not a form
        let i = m.index + 5, depth = 0;
        for (; i < text.length; i++) { const c = text[i]; if (c === "{") depth++; else if (c === "}") depth--; else if (c === ">" && depth === 0) break; }
        if (!text.slice(m.index, i).includes("noValidate")) bad.push(`${path.relative(path.join(__dirname, ".."), full)}:${text.slice(0, m.index).split("\n").length}`);
      }
    }
  };
  roots.forEach(scan);
  assert.deepEqual(bad, [], "add noValidate and say what is missing at the field, in Russian");
});
