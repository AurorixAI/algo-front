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

// ── the whole pending queue, then the urgency order ──────────────────────────────────────────────────

/** A fake API: `total` excuses, newest lesson first (id 1 is the newest), paged like the server (limit <= 200). */
function fakeQueue(total) {
  const calls = [];
  const readPage = async (limit, offset) => {
    calls.push([limit, offset]);
    assert.ok(limit <= 200, "never more than the API allows");
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ id: `e${offset + i + 1}` }));
    return { items, total, pending_total: total };
  };
  return { calls, readPage };
}

test("pending queue: a short queue is one request; a long one is read in pages of 200 up to the cap", async () => {
  const { loadAllPending, PENDING_CAP } = lib("excuses-pending.ts");
  const small = fakeQueue(37);
  const one = await loadAllPending(small.readPage);
  assert.equal(one.items.length, 37);
  assert.equal(small.calls.length, 1);
  assert.equal(one.hidden, 0);

  const mid = fakeQueue(450);
  const all = await loadAllPending(mid.readPage);
  assert.equal(all.items.length, 450, "the whole queue, not the first 50");
  assert.equal(new Set(all.items.map((item) => item.id)).size, 450);
  assert.deepEqual(mid.calls.map(([, offset]) => offset), [0, 200, 400], "the first page is reused, then 200 and 400");
  assert.equal(all.hidden, 0);
  assert.equal(all.pendingTotal, 450);
  assert.equal(PENDING_CAP, 500);
});

test("pending queue: over the cap the OLD end is read (the deadlines that passed), the rest is counted as hidden", async () => {
  const { loadAllPending } = lib("excuses-pending.ts");
  const big = fakeQueue(1200);
  const queue = await loadAllPending(big.readPage);
  assert.equal(queue.items.length, 500, "the safety cap");
  assert.equal(queue.hidden, 700);
  assert.equal(queue.total, 1200);
  const ids = queue.items.map((item) => Number(item.id.slice(1)));
  assert.equal(Math.max(...ids), 1200, "the oldest lesson is on screen");
  assert.equal(Math.min(...ids), 701, "the newest 700 are the ones left out");
  assert.ok(big.calls.every(([limit]) => limit === 200));
});

test("pending queue: a row that moved between two reads is not shown twice; an empty queue is an empty list", async () => {
  const { loadAllPending } = lib("excuses-pending.ts");
  let call = 0;
  const readPage = async (limit, offset) => {
    call += 1;
    return offset === 0
      ? { items: [{ id: "a" }, { id: "b" }], total: 4, pending_total: 4 }
      : { items: [{ id: "b" }, { id: "c" }], total: 4, pending_total: 4 };
  };
  const queue = await loadAllPending(readPage, { pageLimit: 2 });
  assert.deepEqual(queue.items.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(queue.hidden, 1);
  const none = await loadAllPending(async () => ({ items: [], total: 0, pending_total: 0 }));
  assert.deepEqual([none.items.length, none.total, none.hidden], [0, 0, 0]);
});

test("the «Ожидают» tab reads the whole queue; decided tabs keep paging", () => {
  const page = read("src/components/attendance/excuses-page.tsx");
  assert.match(page, /if \(tab === "pending"\) \{[\s\S]*loadAllPending<AttendanceExcuseItem>/);
  assert.match(page, /limit: PAGE_SIZE, offset: page \* PAGE_SIZE/);
  assert.match(page, /!pendingTab && total > PAGE_SIZE/, "no pager over a queue that is already whole");
  assert.match(page, /sortExcusesByUrgency\(items, businessToday\)/);
});
