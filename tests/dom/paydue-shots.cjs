// PAY-DUE, screens part 1: `TMPDIR=<dir> node tests/dom/paydue-shots.cjs <out dir>` - PNGs of every frame of the layout 0-9, 15, 16, 19, 20, 22 by the REAL components at 1280 and 375 (and with long names),
// the data of the layout (tests/helpers/paydue-fixture.cjs).  Prints ONLY suspicious lines: horizontal scroll, text off its block.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
process.env.DOM_CSS = css;
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const X = require("../helpers/paydue-fixture.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const ADMIN = { role: "admin", org_role: "admin", payments_access: true };
const isDry = (r) => /dry_run=(true|1)/.test(r.query);
const LONG_NAME = "Мухаммаджонова Фарангиз Абдурахмоновна-Каримова";
const LONG_GROUP = "Подготовка к олимпиаде по математике, 7 класс (углублённый курс)";
const longRows = (rows) => rows.map((row, i) => (i === 0 ? { ...row, student_name: LONG_NAME, group_name: LONG_GROUP } : row));

const stateOf = (extra) => ({ summary: X.SUMMARY, settings: X.SETTINGS, ...extra });
const server = (extra = {}, state = {}) => (request) => {
  const own = extra.answer?.(request); if (own) return own;
  const s = stateOf(state);
  if (request.path === "/auth/org/payments/summary") return { json: s.summary };
  if (request.path === "/auth/org/payments/status") {
    const page = X.statusPage(request.query);
    return { json: state.long ? { ...page, items: longRows(page.items) } : page };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
  if (request.path === "/auth/org/settings/payments") {
    const days = request.body?.pay_due_days ?? s.settings.pay_due_days; const lessons = request.body?.pay_due_lessons ?? s.settings.pay_due_lessons;
    return { json: request.method === "PUT" && isDry(request) ? { ...s.settings, dry_run: true, pay_due_impact: state.impact ?? X.impact(4, 0), pay_due_example: X.example(days, lessons) } : request.method === "PUT" ? { ...s.settings, ...request.body, pay_due_example: null } : s.settings };
  }
  if (request.path === "/auth/org/stats") return { json: { total_students: 23, total_groups: 3, total_members: 6, active_diagnostics: 0, completed_diagnostics: 0, new_students: 1 } };
  if (request.path === "/auth/org/groups-overview") return { json: { groups: [], avg_theta: null } };
  return null;
};

const GROUP = (long) => ({ id: "g1", name: long ? LONG_GROUP : "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 4, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] });
const groupServer = (long) => server({
  answer: (r) => {
    if (r.path === "/auth/org/groups/g1") return { json: GROUP(long) };
    if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) {
      const bucket = /bucket=([a-z_]+)/.exec(r.query)[1];
      const limit = Number(/limit=(\d+)/.exec(r.query)[1]);
      const row = (x) => (long && x === X.TIMUR ? { ...x, student_name: LONG_NAME } : x);
      if (bucket === "debtors") return { json: { items: [X.LOLA, X.TIMUR].map(row).slice(0, limit), total: 2, students: 2, amount_total: 1200000, limit, offset: 0, as_of: "2026-11-20" } };
      if (bucket === "to_pay") return { json: { items: [X.ANVAR, X.TIMUR].map(row).slice(0, limit), total: 2, students: 2, amount_total: 462000, limit, offset: 0, as_of: "2026-11-20" } };
      return { json: { items: [X.ANVAR, X.LOLA, X.MADINA, X.TIMUR].map(row), total: 4, students: 4, amount_total: 0, limit, offset: 0, as_of: "2026-11-20" } };
    }
    return null;
  },
});
const profileServer = (long) => server({
  answer: (r) => {
    if (r.path === "/auth/org/students/st1/profile") return { json: { student: { id: "st1", org_id: "o", first_name: "Анвар", last_name: long ? LONG_NAME : "Каримов", full_name: long ? `Анвар ${LONG_NAME}` : "Анвар Каримов", class_level: 7, group_id: "g1", display_id: "AL-1", student_phone: null, comment: null, status: "active", created_at: "2026-11-20T08:00:00" }, group: { id: "g1", name: long ? LONG_GROUP : "Математика 7", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К." }, groups: [{ group_id: "g1", group_name: long ? LONG_GROUP : "Математика 7", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", is_primary: true, joined_at: "2026-11-20" }], group_history: [], diagnostics: [], exams: [] } };
    if (r.path === "/auth/org/students/st1/memberships") return { json: [long ? { ...X.ANVAR, group_name: LONG_GROUP } : X.ANVAR] };
    return null;
  },
});

const pk = (id, name, over) => X.base({ membership_id: `m-${id}`, student_id: `s-${id}`, student_name: name, period_mode: "lessons", lessons_total: 8, ...over });
const SAID = pk("said", "Саид Назаров", { unpaid: 100000, due_amount: 100000, due_until: "2026-12-04", due_lessons: { used: 2 }, state: "to_pay", state_text: "К оплате 100 000 сум · 2 урока", due_text: "К оплате 100 000 сум · 2 урока", due_sub: "до 04.12" });
const DIL = pk("dil", "Дильноза Ахмедова", { unpaid: 150000, debt_amount: 50000, due_amount: 100000, due_until: "2026-12-04", due_lessons: { used: 2 }, debt_lessons: 1, state: "debt", state_text: "Долг 50 000 сум · 1 урок", debt_text: "Долг 50 000 сум · 1 урок", debt_sub: "просрочено 3 дня", due_text: "К оплате 100 000 сум · 2 урока", due_sub: "до 04.12", debt_also_text: "и долг 50 000 сум · 1 урок · просрочено 3 дня", due_also_text: "и к оплате 100 000 сум · 2 урока · до 04.12" });
const pkServer = server({
  answer: (r) => {
    if (r.path === "/auth/org/payments/summary") return { json: { ...X.SUMMARY, period_mode: "lessons", debt_total: 50000, debtors: 1, due_total: 200000, due_students: 2, due_nearest: { date: "2026-12-04", text: "до 04.12" }, advance_total: 0, students_with_advance: 0, debt_ages: [], buckets: { debtors: 1, to_pay: 2, expiring: 0, active: 0, paused: 0 } } };
    if (r.path === "/auth/org/payments/status") { const to = /bucket=to_pay/.test(r.query); return { json: { items: to ? [SAID, DIL] : [DIL], total: to ? 2 : 1, students: to ? 2 : 1, amount_total: 0, limit: 50, offset: 0 } }; }
    return null;
  },
});
const emptyServer = server({ answer: (r) => (r.path === "/auth/org/payments/status" ? { json: { items: [], total: 0, students: 0, amount_total: 0, limit: 50, offset: 0 } } : null) });
const lessonsSettings = server({}, { settings: { ...X.SETTINGS, period_mode: "lessons", billing_anchor: "payment_date" } });
const tenSettings = server({}, { settings: { ...X.SETTINGS, pay_due_days: 10 }, impact: X.impact(0, 4) });

const pay = (search, answer = server(), extra = {}) => ({ mount: ["payments", OWNER, { search, ...extra }], answer, steps: async (p) => { await p.waitForFunction(() => document.querySelector('[data-testid="pay-label"]') || /никого нет|Должников нет/.test(document.body.innerText)); } });
const block = async (p, sel = '[data-testid="pay-due-block"]') => { await p.waitForSelector(sel); await p.locator(sel).scrollIntoViewIfNeeded(); };

const FRAMES = [
  { name: "f00-tone-map", mount: ["toneMap", OWNER, {}], answer: server(), steps: async (p) => { await p.waitForSelector('[data-testid="tone-map"]'); }, height: 320 },
  { name: "f01-settings-term", mount: ["settings", OWNER, { moneyAvailable: true }], answer: server(), steps: (p) => block(p) },
  { name: "f02a-settings-5-to-10", mount: ["settings", OWNER, { moneyAvailable: true }], answer: server(), steps: async (p) => { await block(p); await p.fill("#pay-due-days", "10"); await p.waitForSelector('[data-testid="pay-due-impact"]'); await p.locator('[data-testid="pay-due-block"]').scrollIntoViewIfNeeded(); } },
  { name: "f02b-settings-10-to-5", mount: ["settings", OWNER, { moneyAvailable: true }], answer: tenSettings, steps: async (p) => { await block(p); await p.fill("#pay-due-days", "5"); await p.waitForSelector('[data-testid="pay-due-impact"]'); await p.locator('[data-testid="pay-due-block"]').scrollIntoViewIfNeeded(); } },
  { name: "f02c-settings-saved", mount: ["settings", OWNER, { moneyAvailable: true }], answer: server(), steps: async (p) => { await block(p); await p.fill("#pay-due-days", "10"); await p.waitForSelector('[data-testid="pay-due-impact"]'); await p.getByRole("button", { name: /^Сохранить$/ }).click(); await p.waitForSelector("text=Срок оплаты — 10 дней"); await p.waitForTimeout(500); } },
  { name: "f03-settings-package", mount: ["settings", OWNER, { moneyAvailable: true }], answer: lessonsSettings, steps: (p) => block(p, '[data-testid="pay-due-lessons"]') },
  { name: "f04-settings-admin", mount: ["adminSettings", ADMIN, { moneyAvailable: true }], answer: server(), steps: (p) => block(p, '[data-testid="pay-due-readonly"]') },
  { name: "f05-payments-top", mount: ["payments", OWNER, { search: "bucket=to_pay" }], answer: server(), steps: async (p) => { await p.waitForSelector('[data-testid="pay-label"]'); } },
  { name: "f06-payments-to-pay", ...pay("bucket=to_pay") },
  { name: "f06L-payments-to-pay-long-names", ...pay("bucket=to_pay", server({}, { long: true })) },
  { name: "f07-payments-debtors", ...pay("bucket=debtors") },
  { name: "f07L-payments-debtors-long-names", ...pay("bucket=debtors", server({}, { long: true })) },
  { name: "f08a-package-to-pay", ...pay("bucket=to_pay", pkServer) },
  { name: "f08b-package-debtors", ...pay("bucket=debtors", pkServer) },
  { name: "f09a-no-debtors", ...pay("bucket=debtors", emptyServer) },
  { name: "f09b-nothing-to-pay", ...pay("bucket=to_pay", emptyServer) },
  { name: "f15-dashboard", mount: ["dashboard", OWNER, { moneyAvailable: true }], answer: server(), steps: async (p) => { await p.waitForSelector('[data-testid="dashboard-tile-money"]'); await p.waitForTimeout(700); } },
  { name: "f16-group", mount: ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }], answer: groupServer(false), steps: async (p) => { await p.waitForSelector('[data-testid="group-due-chip"]'); await p.waitForSelector('[data-testid="membership-chip"]'); await p.waitForTimeout(600); } },
  { name: "f16L-group-long-names", mount: ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }], answer: groupServer(true), steps: async (p) => { await p.waitForSelector('[data-testid="group-due-chip"]'); await p.waitForSelector('[data-testid="membership-chip"]'); await p.waitForTimeout(600); } },
  { name: "f19-student-card", mount: ["student", OWNER, { moneyAvailable: true }], answer: profileServer(false), steps: async (p) => { await p.waitForSelector('[data-testid="student-money-chip"]'); await p.waitForTimeout(400); } },
  { name: "f19L-student-card-long-names", mount: ["student", OWNER, { moneyAvailable: true }], answer: profileServer(true), steps: async (p) => { await p.waitForSelector('[data-testid="student-money-chip"]'); await p.waitForTimeout(400); } },
];

(async () => {
  const browser = await launch();
  const only = process.argv[3];
  for (const frame of FRAMES) {
    if (only && !frame.name.startsWith(only)) continue;
    for (const width of [1280, 375]) {
      const height = width === 375 ? 812 : frame.height ?? 900;
      const run = await openPage(browser, "paydue.entry.tsx", frame.answer, { width, height });
      try {
        const [name, user, props] = frame.mount;
        await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user, props]);
        await frame.steps(run.page);
        await run.page.waitForTimeout(250);
        const probe = await run.page.evaluate(layoutProbe, "body");
        if (probe.bad.length || probe.scroll > 0) console.log(`SUSPECT ${frame.name} ${width}: ${JSON.stringify(probe).slice(0, 400)}`);
        const errors = run.errors.filter((e) => !/404|Failed to load resource/.test(e));
        if (errors.length) console.log(`ERRORS ${frame.name} ${width}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`);
        await run.page.screenshot({ path: path.join(out, `${frame.name}-${width}.png`), fullPage: width === 375 || ["f06", "f07", "f08", "f16", "f01", "f02", "f03", "f19"].some((p) => frame.name.startsWith(p)) });
      } catch (error) {
        console.log(`FAILED ${frame.name} ${width}: ${String(error).slice(0, 300)}`);
      }
      await run.page.close();
    }
  }
  await browser.close();
})();
