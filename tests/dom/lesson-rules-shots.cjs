// LESSON-RULES: `node tests/dom/lesson-rules-shots.cjs <out dir>` - the PNGs of the screens of the package on the SERVER'S OWN answers (tests/fixtures/lessonRules), 1280 and 375, ordinary and long names, one world (26.11.2026).
// Every shot is checked: no sideways scroll, nothing leaves its box, no console error; the suspicious ones are printed at the end (run with TMPDIR in `artifacts/money1-stage/.cache`).
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
const { answer, listServer, WORLD_DAY } = require("../helpers/lesson-rules-answers.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const ADMIN_NO_MONEY = { role: "admin", org_role: "admin", payments_access: false };
const TEACHER = { role: "teacher", org_role: "teacher" };
const suspicious = [];
const heightOf = (w) => (w === 375 ? 812 : 900);
const KIND = /\/attendance\/cancellation-kind$/;
const LONG = "Индивидуальный курс подготовки к олимпиаде по математике для учеников седьмых и восьмых классов";
const LONG_TEACHER = "Эргашев-Муртазаев Камолиддин";
const LONG_REASON = "Отключили электричество во всём здании, а резервный генератор не запустили до конца дня, поэтому занятие провести не удалось";

async function check(page, errors, label) {
  const probe = await page.evaluate(layoutProbe, "body");
  const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (probe.bad.length || probe.scroll > 0 || pageScroll > 0 || errors.filter((t) => !/404|Failed to load resource|409|422|500/.test(t)).length) suspicious.push(`${label}: ${pageScroll > 0 ? `page scroll ${pageScroll} ` : ""}${JSON.stringify(probe.bad.slice(0, 3))} ${errors.slice(0, 2)}`);
}
const longPending = () => {
  const p = answer("pending_owner");
  p.items[0].group.name = LONG; p.items[0].teacher.name = LONG_TEACHER; p.items[0].cancelledBy.name = LONG_TEACHER; p.items[0].reason = LONG_REASON;
  return p;
};
const longHistory = () => {
  const h = answer("history");
  for (const row of h.items) { row.group.name = LONG; row.teacher.name = LONG_TEACHER; if (row.reason) row.reason = LONG_REASON; if (row.decision) row.decision.note = LONG_REASON; }
  return h;
};
const RETURN_DRY = { ok: true, changed: false, dryRun: true, version: 4, status: "completed", moneyEffects: { students: [], payroll: [{ month: "2026-11", state: "open", sheetId: "sh1", teacherId: "t1", teacherName: "Иванов И.", savedTotal: 0, paid: 0, freshBefore: 75000, freshAfter: 50000, freshTotal: 50000, changedBy: -25000, driftAfter: 0 }], text: "", dryRun: true } };
const historyExtra = (r) => (r.method === "POST" && /\/attendance\/return/.test(r.path) ? { json: RETURN_DRY } : /one-off-decisions\/decided/.test(r.path) ? { json: { items: [], total: 0 } } : null);
const dryServer = (extra) => (r) => {
  if (r.method === "PUT" && KIND.test(r.path)) return { json: /dry_run=true/.test(r.query) ? answer("dry_run_confirm_centre") : { ok: true } };
  return extra ? extra(r) : null;
};

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: heightOf(width) };
    const shot = async (page, name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true }); };
    const open = async (entry, server, who, props, mount = "substitutions") => {
      const run = await openPage(browser, entry, server, { ...size, today: WORLD_DAY });
      await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [mount, who, props]);
      return run;
    };

    // Э1: the row of «Ждут решения» (owner), ordinary and long names
    for (const [tag, pending] of [["ordinary", null], ["long", longPending()]]) {
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ pending }), OWNER, { role: "owner" });
      await page.waitForSelector('[data-testid="waiting-row"]');
      await check(page, errors, `Э1 owner ${tag} ${width}`);
      await shot(page, `E1-owner-pending-${tag}`);
      await page.close();
    }
    // Э1: an administrator WITHOUT the money right: the line «Решает владелец», folded and open
    {
      const pending = answer("pending_admin"); pending.items[0].canDecide = false;
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ pending }), ADMIN_NO_MONEY, { role: "admin" });
      await page.waitForSelector('[data-testid="one-off-decisions-toggle"]');
      await check(page, errors, `Э1 admin folded ${width}`);
      await shot(page, "E1-admin-no-money-folded");
      await page.click('[data-testid="one-off-decisions-toggle"]');
      await check(page, errors, `Э1 admin open ${width}`);
      await shot(page, "E1-admin-no-money-open");
      await page.close();
    }
    // Э2: the window - nothing chosen, «по вине центра», «праздник», «урок был», already decided, month closed
    for (const tag of ["ordinary", "long"]) {
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ pending: tag === "long" ? longPending() : null, extra: dryServer() }), OWNER, { role: "owner" });
      await page.waitForSelector('[data-testid="waiting-row"]');
      await page.click('button[aria-label^="Решить отмену"]');
      await page.waitForSelector('[data-testid="waiting-outcomes"]');
      await page.waitForTimeout(400);
      await check(page, errors, `Э2 empty ${tag} ${width}`);
      await shot(page, `E2-window-nothing-chosen-${tag}`);
      for (const [outcome, wait] of [["centre", /Перерасчёт/], ["holiday", /без перерасчёта/], ["held", /Отмена снимается/]]) {
        await page.click(`[data-testid="waiting-outcome-${outcome}"]`);
        await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('[data-testid="waiting-caption"]')?.textContent ?? ""), wait.source);
        await check(page, errors, `Э2 ${outcome} ${tag} ${width}`);
        await shot(page, `E2-window-${outcome}-${tag}`);
      }
      await page.close();
    }
    for (const [tag, status, body] of [["already-decided", 409, answer("refusals").already_decided], ["period-closed", 409, answer("refusals").period_closed]]) {
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ extra: (r) => (r.method === "PUT" && KIND.test(r.path) ? { status, json: body } : null) }), OWNER, { role: "owner" });
      await page.waitForSelector('[data-testid="waiting-row"]');
      await page.click('button[aria-label^="Решить отмену"]');
      await page.waitForSelector(tag === "already-decided" ? '[data-testid="waiting-decided"]' : '[data-testid="period-closed"]');
      await check(page, errors, `Э2 ${tag} ${width}`);
      await shot(page, `E2-window-${tag}`);
      await page.close();
    }
    // Э3: the history (ordinary, long), the tick, the panel, the states
    for (const [tag, history] of [["ordinary", null], ["long", longHistory()]]) {
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ decided: history, extra: historyExtra }), OWNER, { role: "owner" });
      await page.click('[role="tab"]:has-text("История")');
      await page.waitForSelector('[data-testid="audit-row"]');
      await check(page, errors, `Э3 history ${tag} ${width}`);
      await shot(page, `E3-history-${tag}`);
      if (tag === "ordinary") {
        await page.click('[data-testid="audit-row"][data-kind="backdated"] [data-testid="audit-details"]');
        await page.waitForSelector('[data-testid="audit-panel"]');
        await page.waitForTimeout(500);
        await check(page, errors, `Э3 panel ${width}`);
        await page.screenshot({ path: path.join(out, `E3-panel-entry-${width}.png`) });
      }
      await page.close();
    }
    {
      const empty = { ...answer("history_backdated_only"), items: [], total: 0 };
      const { page, errors } = await open("lesson-rules.entry.tsx", listServer({ extra: (r) => (r.path === "/auth/org/substitutions" && /backdated_only=true/.test(r.query) ? { json: empty } : null) }), OWNER, { role: "owner" });
      await page.click('[role="tab"]:has-text("История")');
      await page.waitForSelector('[data-testid="audit-row"]');
      await page.click('[data-testid="backdated-only"]');
      await page.waitForSelector('text="За 30 дней уроки задним числом не оформлялись"');
      await check(page, errors, `Э3 empty ${width}`);
      await shot(page, "E3-history-empty-filter");
      await page.close();
    }
    {
      const { page, errors } = await open("lesson-rules.entry.tsx", (r) => (r.path === "/auth/org/substitutions" && /status=decided/.test(r.query) ? { status: 500, json: { detail: { code: "SERVER", message: "x" } } } : listServer()(r)), OWNER, { role: "owner" });
      await page.click('[role="tab"]:has-text("История")');
      await page.waitForSelector('[data-testid="list-error"]');
      await check(page, errors, `Э3 error ${width}`);
      await shot(page, "E3-history-error");
      await page.close();
    }
    // Э4: the teacher's block and the card
    {
      const mine = answer("mine_teacher");
      const { page, errors } = await open("lesson-rules.entry.tsx", (r) => (r.path === "/auth/org/substitutions/mine" ? { json: mine } : null), TEACHER, {}, "teacher-block");
      await page.waitForSelector('[data-testid="my-request-row"]');
      await check(page, errors, `Э4 block ${width}`);
      await shot(page, "E4-teacher-block");
      await page.close();
      const step = { kind: "action", action: { lesson: { id: "l", groupName: "Индивидуально: Азизов" }, tone: "rose", actionType: "in_progress", label: "Завершите урок", description: "вт, 24 нояб. · Индивидуально: Азизов", ageDays: 2 } };
      const card = await open("lesson-rules.entry.tsx", () => null, TEACHER, { step }, "next-card");
      await card.page.waitForSelector('[data-testid="next-action-card"]');
      await check(card.page, card.errors, `Э4 card ${width}`);
      await shot(card.page, "E4-teacher-card-not-closed");
      await card.page.close();
    }
    // Э5: the question of the report, the refusals as information
    {
      const consequence = "Отмену подтвердит владелец или администратор с доступом к деньгам: до подтверждения ученикам ничего не меняется";
      const { page, errors } = await open("lesson-rules.entry.tsx", () => null, TEACHER, { date: "2026-11-23", reason: "Отключили свет", consequence }, "cancel-panel");
      await page.waitForSelector('[data-testid="lesson-cancel-panel"]');
      await check(page, errors, `Э5 report ${width}`);
      await shot(page, "E5-report-window");
      await page.close();
      for (const [tag, message, info] of [["nobody-backdated", answer("refusals").nobody_came_backdated.detail.message, true], ["too-old", answer("refusals").lesson_too_old.detail.message, true]]) {
        const run = await open("lesson-rules.entry.tsx", () => null, TEACHER, { message, info }, "rule-notice");
        await run.page.waitForSelector('[data-testid="lesson-rule-refusal"]');
        await check(run.page, run.errors, `Э5 ${tag} ${width}`);
        await shot(run.page, `E5-refusal-${tag}`);
        await run.page.close();
      }
    }
    // Э6: the sheet of a teacher
    {
      const contract = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "logicA", "A26_sheet_f1_one_price_per_period.json"), "utf8"));
      const counts = { ...contract.warnings, open_lessons: 0, unconfirmed_cancellations: 1, unconfirmed_items: [] };
      const { page, errors } = await open("lesson-rules.entry.tsx", () => null, OWNER, { counts }, "sheet-todo");
      await page.waitForSelector('[data-testid="sheet-todo"]');
      await check(page, errors, `Э6 todo ${width}`);
      await shot(page, "E6-sheet-todo");
      await page.close();
    }
    // Э8: «Настройки → Уроки»
    {
      const { page, errors } = await open("lesson-rules.entry.tsx", (r) => (/\/org\/settings\/lessons$/.test(r.path) ? { json: answer("rules_lessons") } : null), OWNER, {}, "lesson-rules");
      await page.waitForSelector('[data-testid="lesson-rule-window"]');
      await check(page, errors, `Э8 settings ${width}`);
      await shot(page, "E8-settings-lessons");
      await page.close();
    }
  }
  await browser.close();
  console.log(suspicious.length ? `SUSPICIOUS (${suspicious.length}):\n${suspicious.join("\n")}` : "no suspicious shot");
})();
