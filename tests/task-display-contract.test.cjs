const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Execute the production selector, including its real math-display dependency.
require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const { renderMathText, allowBreakAfterPunctuation } = require(path.join(__dirname, "../src/components/ui/math-renderer.tsx"));
const { pickTaskDisplayProjection, pickTaskDisplayText } = require(
  path.join(__dirname, "../src/lib/task-display.ts"),
);

const canonical = [
  ["longer legacy statement", "Старое подробное условие. ".repeat(20), "Найдите $x$."],
  ["bare formula", "Вычислите значение выражения.", String.raw`$\frac{3}{4}$`],
  ["legacy includes its own formula", "Решите $x^2 = 9$.", "$x^{2} = 9$"],
  ["Latin wording", "Решите уравнение и проверьте ответ.", "Solve $x+1=2$."],
  ["immutable LaTeX spelling", "Другой текст", String.raw`$x^{\dfrac{5}{6}}$`],
];
for (const [name, question_text, question_latex] of canonical) {
  test(`canonical column: ${name}`, () => {
    const fields = { question_text, question_latex, latex_attested: false };
    assert.deepEqual(pickTaskDisplayProjection(fields), { text: question_latex, renderMode: "trusted" });
    assert.equal(pickTaskDisplayText(fields), question_latex);
    assert.equal(fields.question_latex, question_latex);
  });
}
for (const question_latex of [undefined, null, "", "   "]) {
  test(`empty column falls back: ${String(question_latex)}`, () => {
    assert.deepEqual(pickTaskDisplayProjection({ question_text: "Найдите $x$.", question_latex }), {
      text: "Найдите $x$.", renderMode: "legacy",
    });
  });
}

// ---- line-break rules: glue formulas to the characters they touch ----------
const glue = (html) => [...html.matchAll(/<span class="math-glue">/g)].length;
const plain = (html) => html.replace(/<[^>]*>/g, "");
// text of every glue group, with KaTeX markup removed
const groups = (html) => {
  const res = [];
  let i = 0;
  while ((i = html.indexOf('<span class="math-glue">', i)) !== -1) {
    let depth = 0, j = i;
    for (const m of html.slice(i).matchAll(/<(\/?)span\b[^>]*>/g)) {
      depth += m[1] ? -1 : 1;
      j = i + m.index + m[0].length;
      if (depth === 0) break;
    }
    res.push(plain(html.slice(i, j)));
    i = j;
  }
  return res;
};

test("unit with superscript stays in one nowrap group", () => {
  const html = renderMathText("Площадь равна $10$ см$^{2}$ (ответ округлите до сотых)");
  const g = groups(html);
  assert.equal(g.length, 1);
  assert.match(g[0], /^10\s?см/);
  assert.ok(g[0].includes("2"));
  assert.ok(!g[0].includes("ответ"));
  assert.ok(html.includes("равна <span"), "space before the number stays breakable");
});

test("script-only formula after a space attaches to the word (legacy drops the space)", () => {
  const html = renderMathText("в см $^{2}$ ок");
  assert.equal(groups(html).length, 1);
  assert.ok(!/см\s+<span class="math-glue">/.test(html));
  assert.ok(plain(groups(html)[0]).startsWith("см"));
});

test("punctuation and brackets around a formula are glued", () => {
  const a = renderMathText("Ответ $(x_1;x_2)$, далее");
  assert.deepEqual(groups(a).map((t) => t.endsWith(",")), [true]);
  const b = renderMathText("значение ($a$) равно");
  assert.equal(groups(b).length, 1);
  assert.ok(groups(b)[0].startsWith("(") && groups(b)[0].endsWith(")"));
});

test("number and unit are not separated", () => {
  const html = renderMathText("Длина $12{,}3$ см, ширина");
  const g = groups(html);
  assert.equal(g.length, 1);
  assert.match(g[0], /12.*3.*см,$/);
  assert.equal(glue(renderMathText("Длина $12{,}3$ и ширина")), 0, "not a unit: normal breakable space");
});

test("spaced formulas stay free to wrap", () => {
  assert.equal(glue(renderMathText("Найдите $x$ и $y$ сейчас")), 0);
});

test("long sum breaks only at top-level operators, never inside fractions or parentheses", () => {
  const terms = Array.from({ length: 8 }, (_, i) => `\\frac{x^{${i + 1}}}{${i + 1}}`);
  const html = renderMathText(`$${terms.join("+")}+(a+b-c)=0$`);
  const bases = html.match(/<span class="base"/g) || [];
    assert.equal(bases.length, 10, "8 fraction terms + merged \"(a+b-c)=\" + \"0\"; without the merge it would be 12");
});

test("break opportunities are added after top-level commas, quads, product groups and long digit runs only", () => {
  const abp = allowBreakAfterPunctuation;
  assert.equal(abp("x_1=2, x_2=5"), "x_1=2,\\allowbreak  x_2=5");
  assert.equal(abp("1;2;3"), "1;\\allowbreak 2;\\allowbreak 3");
  assert.equal(abp("12,5+1,5"), "12,5+1,5", "decimal comma stays whole");
  assert.equal(abp("x_{1,2}"), "x_{1,2}", "nothing inside braces");
  assert.equal(abp("\\left(a,b\\right)"), "\\left(a,b\\right)", "nothing inside \\left..\\right");
  assert.equal(abp("\\begin{cases}a,b\\\\c\\end{cases}"), "\\begin{cases}a,b\\\\c\\end{cases}", "nothing inside environments");
  assert.equal(abp("\\left(a\\right)\\left(b\\right)"), "\\left(a\\right)\\allowbreak \\left(b\\right)", "between factors");
  assert.equal(abp("\\left(a\\right)^{2}"), "\\left(a\\right)^{2}", "never before a script");
  assert.equal(abp("\\left(a\\right),"), "\\left(a\\right),", "trailing comma needs no break");
  assert.equal(abp("A\\quad B"), "A\\quad\\allowbreak  B");
  assert.equal(abp("x=1\\text{ или }x=2"), "x=1\\text{ или }\\allowbreak x=2");
  assert.equal(abp("\\text{слово}x"), "\\text{слово}x", "unpadded text is a word, not a connector");
  assert.equal(abp("123456789012345678"), "123456789\\allowbreak 012345678");
  assert.equal(abp("1234567890123"), "1234567890123", "short numbers stay whole");
  assert.equal(abp(abp("a, b")), abp("a, b"), "idempotent");
  assert.equal(abp("1, 2, ..., n"), "1,\\allowbreak  2, ...,\\allowbreak  n", "no break before an ellipsis");
  assert.equal(abp("1, \\dots, n"), "1, \\dots,\\allowbreak  n");
  const html = renderMathText("$x_1=2, x_2=5, x_3=7, x_4=9$");
  assert.equal((html.match(/<span class="base"/g) || []).length >= 7, true, "list now has a break opportunity per item");
  assert.equal(/<wbr>/.test(html), true);
});

test("fitMathElement scales formulas by at most 15 % and otherwise leaves the scroll alone", () => {
  const { fitMathElement, MIN_MATH_FIT } = require(path.join(__dirname, "../src/components/ui/math-fit.ts"));
  const attrs = new Map();
  const box = (clientWidth, widthAt) => {
    const el = {
      clientWidth,
      get scrollWidth() { return widthAt(attrs.get("--math-fit") ? Number(attrs.get("--math-fit")) : 1); },
      querySelectorAll: () => [],
      removeAttribute: () => attrs.delete("data-math-fit"),
      setAttribute: (k) => attrs.set(k, ""),
      style: { removeProperty: (k) => attrs.delete(k), setProperty: (k, v) => attrs.set(k, v) },
    };
    return el;
  };
  attrs.clear();
  assert.equal(fitMathElement(box(200, () => 200)), 1, "fits: untouched");
  attrs.clear();
  const fit = fitMathElement(box(200, (f) => 220 * f));
  assert.ok(fit < 1 && fit >= MIN_MATH_FIT && 220 * fit <= 200 + 1, `10 % over -> scaled (${fit})`);
  attrs.clear();
  assert.equal(fitMathElement(box(200, (f) => 300 * f)), 1, "50 % over: scale cannot help, keep size and scroll");
  assert.equal(attrs.has("data-math-fit"), false);
});

// ─── Scroll affordance of math overflow containers (FE-2) ─────────────────────────────────────

const { overflowEdgeState, SCROLL_REGION_LABEL } = require(path.join(__dirname, "../src/lib/scroll-edges.ts"));

test("overflow edges: the fade shows only on the side that hides content", () => {
  const edges = (scrollLeft, scrollWidth = 600, clientWidth = 300) => overflowEdgeState({ scrollLeft, scrollWidth, clientWidth });
  assert.deepEqual(edges(0), { overflows: true, left: false, right: true });      // at the start: hidden on the right only
  assert.deepEqual(edges(120), { overflows: true, left: true, right: true });     // in the middle: both
  assert.deepEqual(edges(300), { overflows: true, left: true, right: false });    // at the end: hidden on the left only
  assert.deepEqual(edges(299.4), { overflows: true, left: true, right: false });  // sub-pixel rounding at the end
  assert.deepEqual(edges(1.2), { overflows: true, left: false, right: true });    // sub-pixel rounding at the start
  assert.deepEqual(edges(9999), { overflows: true, left: true, right: false });   // overscroll is clamped
  assert.deepEqual(edges(-120), { overflows: true, left: true, right: true });    // RTL: distance from the start
  // no overflow (or within the tolerance): nothing to hint
  assert.deepEqual(edges(0, 300, 300), { overflows: false, left: false, right: false });
  assert.deepEqual(edges(0, 301, 300), { overflows: false, left: false, right: false });
  assert.deepEqual(edges(0, 302, 300), { overflows: false, left: false, right: false });
  assert.equal(edges(0, 303, 300).overflows, true);
  // hidden / unmeasured boxes and junk never claim an overflow
  for (const bad of [{ scrollLeft: 0, scrollWidth: 600, clientWidth: 0 }, { scrollLeft: 0, scrollWidth: Number.NaN, clientWidth: 300 }, { scrollLeft: Number.NaN, scrollWidth: 600, clientWidth: 300 }, null, undefined]) {
    const r = overflowEdgeState(bad);
    if (bad && Number.isNaN(bad.scrollLeft)) assert.deepEqual(r, { overflows: true, left: false, right: true });
    else assert.deepEqual(r, { overflows: false, left: false, right: false });
  }
  assert.equal(SCROLL_REGION_LABEL, "Формула, прокрутите по горизонтали");
});

function fakeBox({ scrollWidth, clientWidth, scrollLeft = 0 }) {
  const attrs = new Map();
  const listeners = {};
  const el = {
    scrollWidth, clientWidth, scrollLeft, children: [], attrs,
    hasAttribute: (n) => attrs.has(n),
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => attrs.set(n, String(v)),
    removeAttribute: (n) => attrs.delete(n),
    // the affordance captures scroll on the root (scroll does not bubble)
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    querySelectorAll: () => [],
    contains: () => true,
    scrolled(to, target = el) { target.scrollLeft = to; (listeners.scroll || []).forEach((fn) => fn({ target, currentTarget: el })); },
    listenerCount: () => (listeners.scroll || []).length,
  };
  return el;
}

test("attachScrollHints: edge flags follow the scroll, the keyboard region exists only while it overflows", () => {
  global.window = { requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {} };
  global.document = {};
  try {
    const { attachScrollHints } = require(path.join(__dirname, "../src/components/ui/scroll-hint.tsx"));
    const box = fakeBox({ scrollWidth: 600, clientWidth: 300 });
    const stop = attachScrollHints(box, { selector: "", includeRoot: true, focusable: true });
    assert.deepEqual([box.hasAttribute("data-sh-left"), box.hasAttribute("data-sh-right")], [false, true]);
    assert.equal(box.getAttribute("tabindex"), "0");
    assert.equal(box.getAttribute("role"), "region");
    assert.equal(box.getAttribute("aria-label"), "Формула, прокрутите по горизонтали");
    box.scrolled(150);
    assert.deepEqual([box.hasAttribute("data-sh-left"), box.hasAttribute("data-sh-right")], [true, true]);
    box.scrolled(300);
    assert.deepEqual([box.hasAttribute("data-sh-left"), box.hasAttribute("data-sh-right")], [true, false]); // at the end: the right fade is gone
    box.scrollWidth = 300; // the box now fits
    box.scrolled(0);
    assert.deepEqual([box.hasAttribute("data-sh-left"), box.hasAttribute("data-sh-right")], [false, false]);
    assert.equal(box.hasAttribute("tabindex"), false, "no tab stop without overflow");
    assert.equal(box.hasAttribute("aria-label"), false);
    stop();
    assert.equal(box.listenerCount(), 0);
    assert.equal(box.attrs.size, 0);

    // inside a button: the fade only; the scroller is kept OUT of the Tab order (tabindex -1), no role / label
    const inButton = fakeBox({ scrollWidth: 600, clientWidth: 300 });
    const stop2 = attachScrollHints(inButton, { selector: "", focusable: false });
    assert.equal(inButton.hasAttribute("data-sh-right"), true);
    assert.equal(inButton.getAttribute("tabindex"), "-1");
    assert.equal(inButton.hasAttribute("aria-label"), false);
    assert.equal(inButton.hasAttribute("role"), false);
    inButton.scrollWidth = 300; // fits again: the mark goes away
    inButton.scrolled(0);
    assert.equal(inButton.hasAttribute("tabindex"), false);
    inButton.scrollWidth = 600;
    inButton.scrolled(0);
    assert.equal(inButton.getAttribute("tabindex"), "-1");
    stop2();
    assert.equal(inButton.attrs.size, 0);

    // an author-set tabindex is neither replaced nor removed
    const authored = fakeBox({ scrollWidth: 600, clientWidth: 300 });
    authored.setAttribute("tabindex", "-1");
    const stop3 = attachScrollHints(authored, { selector: "", focusable: true });
    assert.equal(authored.getAttribute("tabindex"), "-1");
    stop3();
    assert.equal(authored.getAttribute("tabindex"), "-1");
  } finally {
    delete global.window;
    delete global.document;
  }
});

test("SSR markup of a math renderer is unchanged by the affordance (no tab stop, no flags: no layout shift)", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { MathRenderer } = require(path.join(__dirname, "../src/components/ui/math-renderer.tsx"));
  const html = renderToStaticMarkup(React.createElement(MathRenderer, { text: "$$\\frac{x^{1}}{1}+\\frac{x^{2}}{2}$$", block: true }));
  assert.ok(html.includes("math-renderer"));
  for (const attr of ["tabindex", "data-sh-left", "data-sh-right", "aria-label", 'role="region"']) assert.equal(html.includes(attr), false, attr);
});

test("contract: every math overflow container uses the affordance", () => {
  const root = path.join(__dirname, "..", "src");
  const mathRenderer = fs.readFileSync(path.join(root, "components/ui/math-renderer.tsx"), "utf8");
  assert.ok(mathRenderer.includes('from "./scroll-hint"') && mathRenderer.includes("useScrollHint(ref, html"));
  assert.ok(/focusable\?: boolean/.test(mathRenderer));
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  for (const needle of ["[data-sh-left]", "[data-sh-right]", "mask-image", "[data-sh-a11y]:focus-visible", "(hover: hover) and (pointer: fine)", "scrollbar-width: thin"]) {
    assert.ok(css.includes(needle), `globals.css: ${needle}`);
  }
  // a hidden-scrollbar box (`no-scrollbar`) outside MathRenderer itself must be a ScrollHint
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && !full.endsWith(path.join("ui", "math-renderer.tsx"))) {
        fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
          if (/no-scrollbar/.test(line) && !/<ScrollHint/.test(line)) offenders.push(`${path.relative(root, full)}:${i + 1}`);
        });
      }
    }
  })(root);
  assert.deepEqual(offenders, [], "no-scrollbar boxes must be <ScrollHint>");
  // the student / exam option cards: fade only inside the button, and the formula can be scrolled
  const grid = fs.readFileSync(path.join(root, "components/ui/option-grid.tsx"), "utf8");
  assert.ok(grid.includes("<ScrollHint focusable={false}") && grid.includes("focusable={false}"));
  assert.equal(/pointer-events-none/.test(grid), false, "pointer-events-none would block wheel / touch scrolling of the formula");
  const report = fs.readFileSync(path.join(root, "app/admin/diagnostics/[id]/report/page.tsx"), "utf8");
  assert.ok((report.match(/<ScrollHint/g) || []).length >= 2);
});

test("attachScrollHints: a KaTeX display block inside the renderer gets its own edge flags (scroll captured on the root)", () => {
  global.window = { requestAnimationFrame: (fn) => { fn(); return 1; }, cancelAnimationFrame: () => {} };
  global.document = {};
  try {
    const { attachScrollHints } = require(path.join(__dirname, "../src/components/ui/scroll-hint.tsx"));
    const root = fakeBox({ scrollWidth: 300, clientWidth: 300 }); // the renderer itself fits
    const display = fakeBox({ scrollWidth: 900, clientWidth: 300 });
    display.matches = (sel) => sel === ".katex-display";
    root.querySelectorAll = (sel) => (sel === ".katex-display" ? [display] : []);
    const stop = attachScrollHints(root, { selector: ".katex-display", includeRoot: true, focusable: true });
    assert.deepEqual([root.hasAttribute("data-sh-right"), root.hasAttribute("tabindex")], [false, false]); // a fitting box gets nothing
    assert.deepEqual([display.hasAttribute("data-sh-left"), display.hasAttribute("data-sh-right"), display.getAttribute("tabindex")], [false, true, "0"]);
    root.scrolled(300, display); // scroll event of the display block, captured on the root
    assert.deepEqual([display.hasAttribute("data-sh-left"), display.hasAttribute("data-sh-right")], [true, true]);
    root.scrolled(600, display);
    assert.deepEqual([display.hasAttribute("data-sh-left"), display.hasAttribute("data-sh-right")], [true, false]); // end: right fade gone
    // the scroll of something that is not a box is ignored
    const stranger = fakeBox({ scrollWidth: 900, clientWidth: 300 });
    stranger.matches = () => false;
    root.scrolled(100, stranger);
    assert.equal(stranger.hasAttribute("data-sh-left"), false);
    stop();
    assert.equal(display.attrs.size, 0);
    assert.equal(root.listenerCount(), 0);
  } finally {
    delete global.window;
    delete global.document;
  }
});

test("OptionGrid: the card (button) owns the click; the formula inside keeps pointer events for scrolling", () => {
  const grid = fs.readFileSync(path.join(__dirname, "..", "src/components/ui/option-grid.tsx"), "utf8");
  // the click handler is on the card button
  const button = grid.slice(grid.indexOf("<button"), grid.indexOf(">", grid.indexOf("className={cn(", grid.indexOf("<button"))));
  assert.ok(/onClick=\{/.test(button), "onClick is on the <button> card");
  assert.ok(/handleClick\(opt\.key\)/.test(grid));
  // the content inside: no pointer handlers of its own, pointer events not disabled, text not selectable
  const inner = grid.slice(grid.indexOf("<ScrollHint"), grid.indexOf("</ScrollHint>"));
  assert.ok(inner.includes("<MathRenderer"));
  for (const handler of ["onClick", "onPointerDown", "onMouseDown", "onTouchStart", "onTouchEnd", "stopPropagation", "pointer-events-none"]) {
    assert.equal(inner.includes(handler), false, `the formula must not carry ${handler}`);
  }
  assert.ok(inner.includes("select-none"));
  // the scroller inside a button is not a tab stop (focusable={false}) and the card keeps the focus after a tap
  assert.ok(inner.includes("focusable={false}"));
  assert.ok(/document\.activeElement !== card\) card\.focus/.test(grid));
  // two-step selection is unchanged: first tap = pending, second tap on the same option = onSelect
  assert.ok(/if \(pending === answerValue\) \{\s*onSelect\(answerValue\);\s*return;\s*\}\s*setPending\(answerValue\);/.test(grid));
});
