/**
 * Stage findings of 20.10: (1) every dialog locks the page scroll through one counted lock on <html>,
 * (2) the menu counter hangs on the icon and shows at most «99+», (3) the payments notice reads «13 учеников ждут оплаты»,
 * (4) the excuse dialog says when the confirmation deadline has passed - and promises only what the server stores,
 * (5) toasts are centred by a flex host, not by a transform that framer-motion overrides.
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

const root = path.join(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const sources = walk(path.join(root, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f));
const rel = (file) => path.relative(root, file).replace(/\\/g, "/");

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// ── 1. scroll lock ────────────────────────────────────────────────────────────────────────────────

/** A minimal <html>: an inline style that behaves like CSSStyleDeclaration for the properties the lock uses. */
function fakeEnv({ inner = 1440, client = 1425, padding = "0px", inline = {} } = {}) {
  const props = new Map(Object.entries(inline).map(([name, value]) => [name, { value, priority: "" }]));
  const SHORTHAND = { overflow: ["overflow-x", "overflow-y"] };
  const style = {
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
  const html = { style, clientWidth: client };
  return {
    html,
    props,
    env: {
      document: { documentElement: html },
      window: { innerWidth: inner, getComputedStyle: () => ({ paddingRight: padding }) },
    },
  };
}

test("scroll lock: <html> gets overflow hidden and the scrollbar width as padding-right; release restores the exact previous inline styles", () => {
  const { lockScroll, scrollLockCount } = require(path.join(root, "src/lib/scroll-lock.ts"));
  const page = fakeEnv({ inner: 1440, client: 1425 });
  const release = lockScroll(page.env);
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden");
  assert.equal(page.html.style.getPropertyValue("padding-right"), "15px", "the page keeps its width");
  assert.equal(scrollLockCount(page.env), 1);
  release();
  assert.equal(page.props.size, 0, "nothing of the lock is left inline");
  assert.equal(scrollLockCount(page.env), 0);
});

test("scroll lock: no scrollbar (overlay bars, phones) means no padding; an existing padding is added to, not replaced", () => {
  const { lockScroll } = require(path.join(root, "src/lib/scroll-lock.ts"));
  const overlay = fakeEnv({ inner: 390, client: 390 });
  const releaseOverlay = lockScroll(overlay.env);
  assert.equal(overlay.html.style.getPropertyValue("padding-right"), "");
  releaseOverlay();
  const padded = fakeEnv({ inner: 1440, client: 1425, padding: "8px", inline: { "padding-right": "8px" } });
  const releasePadded = lockScroll(padded.env);
  assert.equal(padded.html.style.getPropertyValue("padding-right"), "23px");
  releasePadded();
  assert.equal(padded.html.style.getPropertyValue("padding-right"), "8px", "the previous inline value comes back");
});

test("scroll lock: stacked dialogs lock once; the page is released only by the LAST one, in any order", () => {
  const { lockScroll, scrollLockCount } = require(path.join(root, "src/lib/scroll-lock.ts"));
  const page = fakeEnv({ inline: { overflow: "auto" } });
  const first = lockScroll(page.env);
  const second = lockScroll(page.env);
  assert.equal(scrollLockCount(page.env), 2);
  // the second lock measured the page AFTER the first one hid the scrollbar: it must not double the padding
  assert.equal(page.html.style.getPropertyValue("padding-right"), "15px");
  first();
  assert.equal(page.html.style.getPropertyValue("overflow"), "hidden", "still locked by the second dialog");
  first(); // a second call of the same release is harmless
  assert.equal(scrollLockCount(page.env), 1);
  second();
  assert.equal(page.html.style.getPropertyValue("overflow"), "auto", "the exact previous inline value, not a guess");
  assert.equal(page.html.style.getPropertyValue("padding-right"), "");
  assert.equal(scrollLockCount(page.env), 0);
});

test("scroll lock: without a DOM (server render) nothing happens", () => {
  const { lockScroll } = require(path.join(root, "src/lib/scroll-lock.ts"));
  assert.doesNotThrow(() => lockScroll(null)());
});

test("scroll lock: Modal uses the hook, scrolls its body with overscroll-contain; no screen sets overflow on <html>/<body> itself", () => {
  const modal = read("src/components/ui/modal.tsx");
  assert.match(modal, /export function useScrollLock\(open: boolean\)/);
  assert.match(modal, /useScrollLock\(open\);/);
  assert.match(modal, /overflow-y-auto overscroll-contain/);
  const offenders = sources
    .filter((f) => rel(f) !== "src/lib/scroll-lock.ts")
    .filter((f) => /(document\.body|document\.documentElement|\bhtml|\bbody)\.style\.(overflow|position|paddingRight)\b/.test(fs.readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(offenders, [], "dialogs lock the page through useScrollLock only");
});

test("scroll lock: every file with a full-screen dim layer (fixed inset-0 + blur / dim) locks the page", () => {
  const dim = /fixed (?:inset-0|left-0 top-0)[^"`]*?(?:backdrop-blur|bg-slate-9\d\d\/|bg-black\/)/;
  const unlocked = sources
    .filter((f) => dim.test(fs.readFileSync(f, "utf8").replace(/\n\s*/g, " ")))
    .filter((f) => !/useScrollLock\(/.test(fs.readFileSync(f, "utf8")))
    .map(rel);
  assert.deepEqual(unlocked, []);
});

// ── 2. menu counter ───────────────────────────────────────────────────────────────────────────────

test("menu counter: nothing for 0, the number up to 99, «99+» above; garbage is nothing", () => {
  const { navBadgeText } = require(path.join(root, "src/lib/nav-badge.ts"));
  assert.deepEqual([0, -3, null, undefined, NaN, 1, 13, 15, 99, 100, 250].map(navBadgeText),
    ["", "", "", "", "", "1", "13", "15", "99", "99+", "99+"]);
});

test("menu counter: it hangs on the icon's corner inside the link, not on an offset the link's overflow can cut", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.doesNotMatch(sidebar, /absolute left-\[27px\]/);
  assert.match(sidebar, /<span className="relative flex shrink-0">[\s\S]*?absolute -right-1\.5 -top-1\.5[\s\S]*?navBadgeText\(item\.badge\)/);
  assert.match(sidebar, /title=\{collapsed \?/, "the collapsed link keeps its tooltip");
});

// ── 3. payments notice ────────────────────────────────────────────────────────────────────────────

test("payments notice: «1 ученик ждёт / 2 ученика ждут / 5 учеников ждут / 21 ученик ждёт оплаты»", () => {
  const { bannerCopy } = require(path.join(root, "src/lib/payments-banner.ts"));
  const expected = {
    1: "1 ученик ждёт оплаты", 2: "2 ученика ждут оплаты", 4: "4 ученика ждут оплаты", 5: "5 учеников ждут оплаты",
    11: "11 учеников ждут оплаты", 12: "12 учеников ждут оплаты", 13: "13 учеников ждут оплаты", 14: "14 учеников ждут оплаты",
    20: "20 учеников ждут оплаты", 21: "21 ученик ждёт оплаты", 22: "22 ученика ждут оплаты", 101: "101 ученик ждёт оплаты",
    111: "111 учеников ждут оплаты",
  };
  for (const [count, text] of Object.entries(expected)) assert.equal(bannerCopy({ due: Number(count), expired: 0 }).text, text, count);
  const thirteen = bannerCopy({ due: 13, expired: 0 });
  assert.deepEqual([thirteen.subject, thirteen.predicate], ["13 учеников", "ждут оплаты"]);
  const one = bannerCopy({ due: 1, expired: 0 });
  assert.deepEqual([one.subject, one.predicate], ["1 ученик", "ждёт оплаты"]);
});

test("payments notice: the overdue chip appears only for payments that have ended; the cross hides it until more people wait", () => {
  const { bannerDismissed } = require(path.join(root, "src/lib/payments.ts"));
  const { bannerCopy } = require(path.join(root, "src/lib/payments-banner.ts"));
  assert.equal(bannerCopy({ due: 5, expired: 0 }).chip, null);
  assert.equal(bannerCopy({ due: 5, expired: undefined }).chip, null);
  assert.equal(bannerCopy({ due: 9, expired: 5 }).chip, "из них просрочено: 5");
  assert.equal(bannerDismissed(null, 13), false, "never dismissed");
  assert.equal(bannerDismissed(13, 13), true);
  assert.equal(bannerDismissed(13, 9), true, "fewer people: still hidden");
  assert.equal(bannerDismissed(13, 14), false, "the count grew: it comes back");
  const { summaryToState } = require(path.join(root, "src/lib/payments-summary.ts"));
  assert.equal(summaryToState({ due: 13, expired: 5, ends_today: 8 }).expired, 5);
  assert.equal(summaryToState({ due: 3, expired: 9 }).expired, 3, "never more overdue than due");
  assert.equal(summaryToState({ due: 3 }).expired, 0, "an older server without the field");
});

test("payments notice: a calm light surface, rose only in the chip, one line on desktop, sessionStorage in try/catch", () => {
  const banner = read("src/components/payments/payments-alert-banner.tsx");
  assert.doesNotMatch(banner, /bg-rose-50 px-4|text-rose-900|bg-rose-\d+ px-4 py-2\.5/, "not a red bar");
  assert.match(banner, /border border-slate-200 bg-white/);
  assert.match(banner, /bg-amber-50 text-amber-600/);
  assert.match(banner, /rounded-full bg-rose-50 px-2 py-0\.5/);
  assert.match(banner, /sm:whitespace-nowrap|whitespace-nowrap text-sm text-slate-600/);
  assert.match(banner, /try \{[\s\S]*sessionStorage\.getItem[\s\S]*\} catch/);
  assert.match(banner, /try \{[\s\S]*sessionStorage\.setItem[\s\S]*\} catch/);
  assert.match(banner, /Открыть список/);
  assert.match(banner, /aria-label="Скрыть напоминание"/);
  // the role rules and the data source are as before
  assert.match(banner, /usePaymentsSummary\(\(state\) => state\.available\)/);
  assert.match(banner, /pathname\?\.startsWith\(paymentsBasePath\)/);
});

// ── 4. excuse decision after the deadline ─────────────────────────────────────────────────────────

const TODAY = "2026-10-20";
const excuseItem = (over = {}) => ({
  id: "ex-1", status: "pending", billing_mode: null, lesson_date: "2026-10-05",
  group: { name: "Математика 9А" }, student: { full_name: "Иванова Ольга" }, reason: "Болела",
  reason_by: { name: "Дилноза Каримова" }, reason_at: "2026-10-09T16:35:00", ...over,
});

test("deadline passed: exactly when the list says «срок прошёл» - date, lessons package, month-end fallback", () => {
  const { excuseDeadlinePassed, excuseDeadlineView } = require(path.join(root, "src/lib/excuse-deadline.ts"));
  const cases = [
    { deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } },
    { deadline: { kind: "date", date: "2026-10-20", overdue: false, days_left: 0 } },
    { deadline: { kind: "date", date: "2026-10-31", overdue: false, days_left: 11 } },
    { deadline: { kind: "date", date: "2026-10-12", days_left: -1 } },
    { deadline: { kind: "lessons", lessons_left: 0, urgent: true, due_now: false, overdue: true } },
    { deadline: { kind: "lessons", lessons_left: 1, urgent: true, due_now: true, overdue: false } },
    { deadline: { kind: "lessons", lessons_left: 5, urgent: false, due_now: false, overdue: false } },
    { deadline: null, lesson_date: "2026-09-12" },    // older server: month end 30.09 has passed
    { deadline: undefined, lesson_date: "2026-10-12" }, // month end 31.10: still in time
    { deadline: { kind: "date", date: "garbage", overdue: true }, lesson_date: "2026-09-12" },
    { status: "confirmed", deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } },
  ];
  for (const over of cases) {
    const item = excuseItem(over);
    const view = excuseDeadlineView(item, TODAY);
    const passed = excuseDeadlinePassed(item, TODAY);
    assert.equal(passed !== null, Boolean(view && view.text.endsWith("срок прошёл")), JSON.stringify(over));
  }
  const datePassed = excuseDeadlinePassed(excuseItem({ deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } }), TODAY);
  assert.deepEqual(datePassed, { date: "2026-10-12" });
  assert.deepEqual(excuseDeadlinePassed(excuseItem({ deadline: { kind: "lessons", lessons_left: 0, urgent: true, overdue: true } }), TODAY), { date: null });
  assert.deepEqual(excuseDeadlinePassed(excuseItem({ deadline: null, lesson_date: "2026-09-12" }), TODAY), { date: "2026-09-30" });
});

test("deadline passed: the dialog note names the real date and promises only what the server stores", () => {
  const D = require(path.join(root, "src/lib/excuse-decision.ts"));
  const late = D.subjectOfItem(excuseItem({ deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } }), TODAY);
  const note = D.lateDecisionNote([late]);
  assert.equal(note, "Срок подтверждения прошёл (до 12.10). Решение можно принять: в списке и в журнале останется, кто принял его и когда.");
  // the server has NO «late» flag: stored are who decided, when and the note - the text must not claim a mark that is not there
  assert.doesNotMatch(note, /отмечено|помечено|просроч/i);
  // a package: no date to name
  const pack = D.subjectOfItem(excuseItem({ deadline: { kind: "lessons", lessons_left: 0, urgent: true, overdue: true } }), TODAY);
  assert.ok(D.lateDecisionNote([pack]).startsWith("Срок подтверждения прошёл (по пакету ученика)."));
  // in time, unknown (no business date given / the journal cell), or already decided: silence
  const inTime = D.subjectOfItem(excuseItem({ deadline: { kind: "date", date: "2026-10-31", overdue: false, days_left: 11 } }), TODAY);
  assert.equal(D.lateDecisionNote([inTime]), null);
  assert.equal(D.subjectOfItem(excuseItem({ deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } })).deadlinePassed, null);
  const journal = D.subjectOfJournalCell({ excuse: { id: "e", status: "pending", reason: "Болел", reason_by_name: null, reason_at: null }, studentName: "Петров", lessonDate: "2026-09-01" });
  assert.equal(D.lateDecisionNote([journal]), null);
  // bulk
  assert.equal(D.lateDecisionNote([late, inTime, inTime]), "Срок подтверждения прошёл у 1 из 3 пропусков. Решения можно принять: в списке и в журнале останется, кто принял их и когда.");
  assert.ok(D.lateDecisionNote([late, late]).startsWith("Срок подтверждения прошёл у всех пропусков (2)."));
});

test("deadline passed: the amber note sits above «Что изменится» and only when the deadline has passed", () => {
  const D = require(path.join(root, "src/lib/excuse-decision.ts"));
  const { ExcuseDecisionBody } = require(path.join(root, "src/components/attendance/excuse-decision-body.tsx"));
  const html = (over) => renderToStaticMarkup(React.createElement(ExcuseDecisionBody, {
    items: [D.subjectOfItem(excuseItem(over), TODAY)], decision: "confirmed",
  }));
  const late = html({ deadline: { kind: "date", date: "2026-10-12", overdue: true, days_left: -8 } });
  assert.ok(late.includes('data-testid="excuse-decision-late"'));
  assert.ok(late.indexOf("excuse-decision-late") < late.indexOf("excuse-decision-consequence"), "above the consequence");
  assert.ok(textOf(late).includes("Срок подтверждения прошёл (до 12.10)."));
  assert.match(late, /border-amber-200 bg-amber-50/);
  assert.equal(html({ deadline: { kind: "date", date: "2026-10-31", overdue: false, days_left: 11 } }).includes("excuse-decision-late"), false);
  assert.equal(html({}).includes("excuse-decision-late"), false, "no deadline, nothing claimed");
  // the list passes the business date to the dialog subject
  assert.match(read("src/components/attendance/excuses-page.tsx"), /subjectOfItem\(item, businessToday\)/);
});

// ── 5. toasts ─────────────────────────────────────────────────────────────────────────────────────

test("toasts: one flex host over the bottom edge with a safe-area gutter; the toast is not centred by a transform", () => {
  const toast = read("src/components/ui/toast.tsx");
  assert.match(toast, /fixed inset-x-0 bottom-0/);
  assert.match(toast, /flex flex-col items-center gap-2/);
  assert.match(toast, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(toast, /px-4/);
  assert.match(toast, /w-full max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(toast, /break-words/);
  assert.match(toast, /sm:w-auto sm:max-w-md/);
  assert.doesNotMatch(toast, /-translate-x-1\/2/, "framer-motion owns transform: a translate class would be dropped");
  assert.doesNotMatch(read("src/components/ui/analyzing-toast.tsx"), /-translate-x-1\/2/);
  assert.doesNotMatch(read("src/app/owner/groups/page.tsx"), /-translate-x-1\/2/);
});
