/**
 * UX-1 R3 round: the five hand-made dialogs on the shared Modal, scroll lock on iOS and the exact restore of inline styles,
 * the one «left» phrase, names of actions, the bottom bar, viewport and safe areas, the order of pending excuses,
 * and the last nits.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

// ── scroll lock: exact restore (with !important) and the iOS variant ─────────────────────────────────

/** A CSSStyleDeclaration stand-in that keeps the priority of every property, like a real inline style. */
function styleOf(initial = {}) {
  const props = new Map(Object.entries(initial).map(([name, [value, priority = ""]]) => [name, { value, priority }]));
  const SHORTHAND = { overflow: ["overflow-x", "overflow-y"] };
  return {
    props,
    getPropertyValue: (name) => props.get(name)?.value ?? "",
    getPropertyPriority: (name) => props.get(name)?.priority ?? "",
    setProperty(name, value, priority = "") {
      for (const longhand of SHORTHAND[name] ?? []) props.delete(longhand);
      props.set(name, { value, priority });
    },
    removeProperty(name) {
      for (const longhand of SHORTHAND[name] ?? []) props.delete(longhand);
      const old = props.get(name)?.value ?? "";
      props.delete(name);
      return old;
    },
  };
}
const snapshot = (style) => JSON.stringify([...style.props.entries()].sort());

function pageEnv({ htmlInline = {}, bodyInline = {}, navigator, scrollY = 0, inner = 390, client = 390 } = {}) {
  const html = { style: styleOf(htmlInline), clientWidth: client };
  const body = { style: styleOf(bodyInline) };
  const scrolls = [];
  return {
    html, body, scrolls,
    env: {
      document: { documentElement: html, body },
      window: { innerWidth: inner, getComputedStyle: () => ({ paddingRight: "0px" }), scrollY, scrollTo: (x, y) => scrolls.push([x, y]), navigator },
    },
  };
}

test("scroll lock: the inline styles come back EXACTLY, the priority (!important) included, in any release order", () => {
  const { lockScroll } = lib("scroll-lock.ts");
  const page = pageEnv({ htmlInline: { overflow: ["auto", "important"], "padding-right": ["8px", "important"] }, inner: 1440, client: 1425 });
  const before = snapshot(page.html.style);
  const first = lockScroll(page.env);
  const second = lockScroll(page.env);
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden");
  second();
  first();
  assert.equal(snapshot(page.html.style), before, "value and priority are the ones that were there");
  assert.equal(page.html.style.getPropertyPriority("overflow"), "important");
  assert.equal(page.html.style.getPropertyPriority("padding-right"), "important");
});

test("scroll lock: iOS / iPadOS lock <body> (position fixed, top -scrollY, width 100%) and give the page back at its place", () => {
  const { lockScroll, scrollLockCount, isIosEnv } = lib("scroll-lock.ts");
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
  const page = pageEnv({ navigator: iphone, scrollY: 640, bodyInline: { position: ["relative", "important"], top: ["8px"] } });
  const htmlBefore = snapshot(page.html.style);
  const bodyBefore = snapshot(page.body.style);
  const release = lockScroll(page.env);
  assert.equal(page.body.style.getPropertyValue("position"), "fixed");
  assert.equal(page.body.style.getPropertyValue("top"), "-640px");
  assert.equal(page.body.style.getPropertyValue("width"), "100%");
  assert.equal(snapshot(page.html.style), htmlBefore, "<html> is not touched on iOS");
  const second = lockScroll(page.env); // stacked: counted, the position is read once
  assert.equal(scrollLockCount(page.env), 2);
  release();
  assert.equal(page.body.style.getPropertyValue("position"), "fixed", "still locked by the second dialog");
  assert.deepEqual(page.scrolls, []);
  second();
  assert.equal(snapshot(page.body.style), bodyBefore, "body's inline styles, !important included, are back");
  assert.deepEqual(page.scrolls, [[0, 640]], "scrollTo gives the page back where it was");
  // an iPad with desktop Safari calls itself a Mac but has a touch screen
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 } }).env), true);
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 } }).env), false);
  assert.equal(isIosEnv(pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5 } }).env), false);
  assert.equal(isIosEnv(pageEnv({}).env), false, "no navigator: not iOS");
});

test("scroll lock: everywhere else <html> overflow is used and <body> is left alone", () => {
  const { lockScroll } = lib("scroll-lock.ts");
  const page = pageEnv({ navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/150", platform: "Win32", maxTouchPoints: 0 }, scrollY: 300, inner: 1440, client: 1425 });
  const release = lockScroll(page.env);
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden");
  assert.equal(page.body.style.props.size, 0);
  release();
  assert.equal(page.html.style.props.size, 0);
  assert.deepEqual(page.scrolls, []);
});
