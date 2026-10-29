// Three defects of prod 28.10 (centre «ALGO Лид-тест»), fixed in the pack #154 front: the type of the organisation in Latin, «Лобби открыто» for an exam of
// a later day, 403 requests of an administrator without the right to money.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const text = (html) => html.replace(/<[^>]+>/g, "|").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\|+/g, "|");

const { orgTypeLabel, ORG_TYPES } = require(path.join(root, "src/lib/org-type.ts"));
const L = require(path.join(root, "src/lib/exam-lobby.ts"));


// ── B1: the type of the organisation ────────────────────────────────────────────────────────────────────────

test("B1: one function says all six types the server allows; an unknown or empty one is never Latin", () => {
  assert.deepEqual(ORG_TYPES, ["center", "private_school", "university", "tutoring_center", "tutor", "other"]);
  assert.equal(orgTypeLabel("center"), "Учебный центр");
  assert.equal(orgTypeLabel("private_school"), "Частная школа");
  assert.equal(orgTypeLabel("university"), "Университет");
  assert.equal(orgTypeLabel("tutoring_center"), "Репетиторский центр");
  assert.equal(orgTypeLabel("tutor"), "Репетитор");
  assert.equal(orgTypeLabel("other"), "Другое");
  for (const odd of ["Center", "kindergarten", "", "  ", null, undefined, "constructor", "__proto__", "toString"]) {
    assert.equal(orgTypeLabel(odd), "Не указан", String(odd));
  }
  for (const type of ORG_TYPES) assert.doesNotMatch(orgTypeLabel(type), /[a-z_]/);
});

test("B1: the owner's panel uses the function, no raw org_type is rendered anywhere in src", () => {
  assert.match(read("src/app/owner/dashboard/page.tsx"), /\{orgTypeLabel\(org\?\.org_type\)\}/);
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(entry.name) && /\{[^}]*\.org_type[^}]*\}/.test(read(rel)) && !/orgTypeLabel\(/.test(read(rel))) offenders.push(rel);
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});

// ── B2: the lobby of an exam of a later day ─────────────────────────────────────────────────────────────────

test("B2: «Лобби открыто» only for an exam of TODAY whose lesson is in progress", () => {
  const state = (over) => L.dashboardExamState({ status: "lobby", scheduledDate: "2026-11-03", today: "2026-10-29", lessonStatus: null, ...over });
  assert.equal(state({}), "upcoming", "5 days ahead: not a lobby");
  assert.equal(state({ scheduledDate: "2026-10-30" }), "upcoming");
  assert.equal(state({ scheduledDate: "2026-10-29", lessonStatus: "scheduled" }), "today", "today, the lesson is not started yet");
  assert.equal(state({ scheduledDate: "2026-10-29", lessonStatus: null }), "today");
  assert.equal(state({ scheduledDate: "2026-10-29", lessonStatus: "in_progress" }), "lobby");
  assert.equal(state({ scheduledDate: "2026-10-29", lessonStatus: "completed" }), "today");
  assert.equal(state({ scheduledDate: "2026-10-28" }), "needs_resolution");
  assert.equal(state({ scheduledDate: "" }), "upcoming", "no lesson date: nobody can enter");
  assert.equal(state({ scheduledDate: null }), "upcoming");
  assert.equal(state({ status: "active", scheduledDate: "2026-11-03" }), "active");
  assert.equal(state({ status: "closed", scheduledDate: "2026-10-01" }), "closed");
  // a printed set is never a lobby
  assert.equal(state({ status: "print_ready", scheduledDate: "2026-10-29", lessonStatus: "in_progress" }), "today");
});

test("B2: the badge says «Запланирован · день» before the lesson, «Сегодня» on the day, and the page uses the function in both views", () => {
  assert.equal(L.scheduledExamLabel("upcoming", "вт, 3 нояб."), "Запланирован · вт, 3 нояб.");
  assert.equal(L.scheduledExamLabel("upcoming", ""), "Запланирован");
  assert.equal(L.scheduledExamLabel("today", "чт, 29 окт."), "Запланирован · сегодня");
  const page = read("src/app/teacher/dashboard/page.tsx");
  assert.match(page, /dashboardExamState\(\{/);
  assert.equal((page.match(/const isLobby = exam\.state === "lobby";/g) || []).length, 2, "the card and the queue");
  assert.doesNotMatch(page, /const isLobby = exam\.status === "lobby"/);
  assert.equal((page.match(/scheduledExamLabel\(exam\.state, exam\.dayLabel\)/g) || []).length, 2);
});

// ── B3: an administrator without the right to money asks nothing ────────────────────────────────────────────

test("B3: moneyDeniedFor - the profile alone is enough; an unknown profile waits for the summary", () => {
  const { moneyDeniedFor } = require(path.join(root, "src/lib/payments-summary.ts"));
  assert.equal(moneyDeniedFor({ payments_access: false }, { loaded: false, available: false }), true);
  assert.equal(moneyDeniedFor({ payments_access: true }, { loaded: false, available: false }), false);
  assert.equal(moneyDeniedFor({}, { loaded: false, available: false }), false, "an older server: asked as before");
  assert.equal(moneyDeniedFor({}, { loaded: true, available: false }), true);
  assert.equal(moneyDeniedFor({ payments_access: true }, { loaded: true, available: true }), false);
  assert.equal(moneyDeniedFor(null, { loaded: false, available: false }), false);
});

test("B3: the summary of the openings is not requested for a user without the right", async () => {
  const { useAuthStore } = require(path.join(root, "src/lib/store.ts"));
  const { usePaymentsSummary } = require(path.join(root, "src/lib/payments-summary.ts"));
  const { loadOpeningsSummary } = require(path.join(root, "src/lib/openings-summary.ts"));
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({ totals: { missing: 0 } }) }; };
  try {
    usePaymentsSummary.getState().reset();
    useAuthStore.setState({ user: { id: "a", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "admin", org_role: "admin", payments_access: false }, isAuthenticated: true });
    assert.equal(await loadOpeningsSummary(true), null);
    assert.equal(calls.filter((url) => /opening-balances\/summary/.test(url)).length, 0);
  } finally {
    global.fetch = original;
    useAuthStore.setState({ user: null, isAuthenticated: false });
  }
});

test("B3: every page of «Оплаты» asks nothing while the right is missing (source guard)", () => {
  const base = "src/components/payments/";
  const page = read(`${base}payments-page.tsx`);
  assert.match(page, /const noRight = useMoneyDenied\(\);/);
  assert.match(page, /if \(noRight\) \{ setLoading\(false\); return; \}/, "the list");
  assert.match(page, /if \(!narrowed \|\| noRight\)/, "the counts of a narrowed list");
  assert.match(page, /if \(denied \|\| noRight\)/, "the screen «недоступен»");
  for (const file of ["income-page", "receipt-view", "statement-view"]) assert.match(read(`${base}${file}.tsx`), /const noRight = useMoneyDenied\(\);/, file);
  for (const file of ["group-prices-page", "openings-page"]) {
    const source = read(`${base}${file}.tsx`);
    assert.match(source, /const noRight = useMoneyDenied\(\);/, file);
    assert.match(source, /if \(noRight\) \{ setLoading\(false\); return; \}/, file);
  }
});

