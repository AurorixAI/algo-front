// PAY-TAILS Б11.21: `node tests/dom/paytails-part11-shots.cjs <out dir>` - the PNGs of the changed screens, 1280 and 375, named «<пункт>-<вид>-<ширина>.png».  Prints ONLY suspicious lines
// (sideways scroll, text off its block, a console error).  Run with TMPDIR in `artifacts/money1-stage/.cache` (the css of the run goes there).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..", "..");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const compile = (extra = []) => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), ...extra, "-o", css], { cwd: root, stdio: "pipe" });
  return css;
};
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe } = require("../helpers/layout-probe.cjs");
const F = require("../helpers/money2-fixture.cjs");
const X2 = require("../helpers/paytails-fixture2.cjs");
const P3 = require("../helpers/paydue-part3.cjs");
const X = require("../helpers/paytails-fixture.cjs");
const { statementAllKinds } = require("../helpers/statement-all-kinds.cjs");
const { fixture } = require("../helpers/dom-answers.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const suspicious = [];
const heightOf = (width) => (width === 375 ? 812 : 900);

async function check(page, errors, label, scope = "body") {
  const probe = await page.evaluate(layoutProbe, scope);
  const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (probe.bad.length || probe.scroll > 0 || pageScroll > 0 || errors.length) suspicious.push(`${label}: ${pageScroll > 0 ? `page scroll ${pageScroll} ` : ""}${probe.scroll > 0 ? `scroll ${probe.scroll} ` : ""}${JSON.stringify(probe.bad).slice(0, 260)} ${errors.join(" | ").slice(0, 160)}`);
}
const shot = async (page, name, full = false) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: full });

(async () => {
  process.env.DOM_CSS = compile();
  const browser = await launch();
  for (const width of [1280, 375]) {
    const size = { width, height: heightOf(width) };

    // п.1 «Решения»
    {
      const rows = [
        { id: "d1", at: "2026-11-05T09:20:00", kind: "payment_writeoff", kind_label: "Прощено", student_id: "s1", student_name: "Тошматов Бобур", group_name: "Алгебра 7", amount: 220000, used: 94000, used_text: "использовано 94 000 сум", new_amount: null, receipt_no: null, reason: "семья в трудном положении", actor_name: "Рустам Валиев", debt_before: 220000, debt_after: 126000 },
        { id: "d2", at: "2026-11-04T09:20:00", kind: "payment_writeoff", kind_label: "Прощено", student_id: "s2", student_name: "Каримова Дилноза Шухратовна", group_name: "Геометрия 8 (углублённый курс по четвергам)", amount: 100000, used: 100000, used_text: null, new_amount: null, receipt_no: null, reason: "ошибка начисления", actor_name: "Рустам Валиев", debt_before: 100000, debt_after: 0 },
      ];
      const { page, errors } = await openPage(browser, "money-v.entry.tsx", (r) => (r.path === "/auth/org/payments/decisions" ? { json: { as_of: "2026-11-10", from: "2026-11-01", to: "2026-11-30", page: 1, size: 25, total: 2, pages: 1, since: "2026-11-02", rows } } : null), size);
      await page.evaluate(() => window.mount("decisions", undefined, {}));
      await page.waitForSelector('[data-testid="decision-row"]');
      await page.locator('[data-testid="decision-row"]').first().click();
      await page.waitForTimeout(300);
      await check(page, errors, `1-${width}`);
      await shot(page, `1-decisions-${width}`);
      await page.close();
    }

    // п.2 the refusal of a price
    {
      const words = "У 1 ученика исправление превратит прощённый долг в переплату. Сначала отмените прощение долга, затем исправьте цену.";
      const { page, errors } = await openPage(browser, "money-v.entry.tsx", (r) => (r.method === "PUT" && r.path === "/auth/org/groups/g1/price" ? { status: 409, json: { detail: { code: "PRICE_CORRECTION_FORGIVENESS", message: words, students: [{ membership_id: "m0", student_name: "Тошматов Бобур Абдуллаевич" }] } } } : null), size);
      await page.evaluate(() => window.mount("groupPrice", undefined, {}));
      await page.waitForSelector("#group-price-amount");
      await page.fill("#group-price-amount", "30 000");
      await page.waitForSelector('[data-testid="price-blocked"]');
      await page.waitForTimeout(600);
      await check(page, errors, `2-${width}`, '[role="dialog"]');
      await shot(page, `2-price-refusal-${width}`);
      await page.close();
    }

    // п.3 the label of the reason of a pause
    {
      const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const future = { id: "pf", membership_id: "m-a", first_day: day(10), last_day: day(13), days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null };
      const answer = F.baseServer((r) => (r.method === "GET" && r.path === "/auth/org/memberships/m-a/pauses" ? { json: [future] } : r.method === "POST" && r.path === "/auth/org/pauses/pf/void" ? { json: { pause: future, impact: null, row: null, dry_run: true, other_groups_text: null } } : null));
      const { page, errors } = await openPage(browser, "money2.entry.tsx", answer, size);
      await page.evaluate(() => window.mount("pause", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
      await page.waitForSelector('section[aria-label="Паузы ученика"]');
      await page.getByRole("button", { name: "Снять паузу целиком" }).first().click();
      await page.waitForSelector("#pause-act-reason");
      await page.waitForTimeout(500);
      await check(page, errors, `3-${width}`, '[role="dialog"]');
      await shot(page, `3-pause-reason-${width}`);
      await page.close();
    }

    // п.4 the refusal 409 BALANCE_CHANGED: the window stays - leaving, transfer, the archive of a student
    {
      const memberships = [X2.LEAVE_DEBT()];
      const { page, errors } = await openPage(browser, "money2.entry.tsx", F.baseServer(X2.leaveServer(memberships, () => X2.STALE_409)), size);
      await page.evaluate(() => window.mount("leave-lines", { role: "owner", org_role: "owner" }));
      await page.waitForSelector('[data-testid="settle-membership"]');
      await page.getByRole("button", { name: "Убрать из группы" }).click();
      await page.waitForSelector('[data-testid="balance-stale"]');
      await page.waitForTimeout(500);
      await check(page, errors, `4-leave-${width}`, '[role="dialog"]');
      await shot(page, `4-leave-${width}`);
      await page.close();
    }
    {
      const { page, errors } = await openPage(browser, "money2.entry.tsx", F.baseServer(X2.archiveServer([X2.LEAVE_DEBT()], () => X2.STALE_409)), size);
      await page.evaluate(() => window.mount("archive-lines", { role: "owner", org_role: "owner" }, { groupNames: ["Математика 7"] }));
      await page.waitForSelector('[data-testid="settle-membership"]');
      await page.getByRole("button", { name: "В архив" }).click();
      await page.waitForSelector('[data-testid="balance-stale"]');
      await page.waitForTimeout(500);
      await check(page, errors, `4-archive-${width}`, '[role="dialog"]');
      await shot(page, `4-student-archive-${width}`);
      await page.close();
    }
    {
      let writes = 0;
      const answer = F.baseServer((r) => {
        if (r.path !== "/auth/org/groups/gt/students/st1") return null;
        if (/dry_run=true/.test(r.query)) return { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, as_of: "2026-11-21", effects: F.transferEffects({ carried: writes ? 465000 : 440000 }) } };
        writes += 1;
        return { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Сумма изменилась, откройте окно заново" } } };
      });
      const second = await openPage(browser, "money2.entry.tsx", answer, size);
      await second.page.evaluate((p) => window.mount("assign", { role: "owner", org_role: "owner" }, p), { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] });
      await second.page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');
      await second.page.waitForSelector('[data-testid="transfer-effects"]');
      await second.page.click('[data-testid="assign-submit"]');
      await second.page.waitForSelector('[data-testid="balance-stale"]');
      await second.page.waitForTimeout(700);
      await check(second.page, second.errors, `4-transfer-${width}`, '[role="dialog"]');
      await shot(second.page, `4-transfer-${width}`);
      await second.page.close();
    }

    // п.5 / п.7 the statement: «—» of a forgiveness, no empty «Остаток» caption
    {
      const answer = F.baseServer((r) => {
        if (r.path === "/auth/org/memberships/m-a/statement") { const d = statementAllKinds(F.SHORT); d.rows.find((row) => row.type === "writeoff").credit = 0; return { json: d }; }
        if (r.path === "/auth/org/memberships/m-a/payments") return { json: [] };
        return null;
      }, F.SHORT);
      const { page, errors } = await openPage(browser, "money2.entry.tsx", answer, size);
      await page.evaluate(() => window.mount("statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }));
      await page.waitForSelector('[data-testid="statement-row-writeoff"]');
      await page.waitForTimeout(400);
      await check(page, errors, `5-${width}`);
      await shot(page, `5-statement-${width}`, true);
      await page.close();
    }

    // п.7 the phone of «Оплаты»: the link of the prices; the row of a student who left in a group (and п.6 below)
    {
      const OPENINGS = { accounting_start: "2026-09-01", state: "done", can_set_opening: true, totals: { left_available: 0, memberships: 40, missing: 0, needs_review: 0 } };
      const base = (extra, over = {}) => (r) => {
        if (extra) { const own = extra(r); if (own) return own; }
        if (r.path === "/auth/org/payments/summary") return { json: { ...X.SUMMARY, price_missing: 5 } };
        if (r.path === "/auth/org/payments/status") return { json: X.statusOf(r.query) };
        if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: "Математика 7", teacher_id: "t1" }] };
        if (r.path === "/auth/org/members") return { json: [] };
        if (r.path === "/auth/org/opening-balances/summary") return { json: OPENINGS };
        return null;
      };
      const mountPage = async (answer, args) => { const run = await openPage(browser, "paydue.entry.tsx", answer, size); await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), args); return run; };
      {
        const { page, errors } = await mountPage(base(), ["payments", OWNER, { moneyAvailable: true, search: "bucket=debtors" }]);
        await page.waitForSelector('[data-testid="payments-price-label"], [data-testid="payments-header-links"]');
        await page.waitForTimeout(500);
        await check(page, errors, `7-payments-${width}`);
        await shot(page, `7-payments-${width}`);
        await page.close();
      }
      const GROUP = { id: "g1", name: "Математика 7", status: "active", class_level: 7, teacher_id: "t1", teacher_name: "Каримова К.", max_students: 30, student_count: 3, students: [], price_current: { amount: 600000 }, lesson_type: "group", schedule: [] };
      let paid = false;
      const status = (query) => {
        const bucket = new URLSearchParams(query).get("bucket");
        if (bucket === "left_open") return paid ? X.page([X.DILSHOD, X.KAMOLA], { total: 2, students: 2, left_count: 2 }) : X.page([X.FERUZA, X.DILSHOD, X.KAMOLA], { total: 3, students: 3, left_count: 3 });
        if (bucket === "debtors") return paid ? X.page([X.LOLA], { total: 1, students: 1, amount_total: 200000 }) : X.page([X.LOLA, X.FERUZA], { total: 2, students: 2, amount_total: 615000 });
        return X.groupStatus(query);
      };
      const answer = base((r) => {
        if (r.path === "/auth/org/groups/g1") return { json: GROUP };
        if (r.path === "/auth/org/payments/status" && /group_id=g1/.test(r.query)) return { json: status(r.query) };
        const m = /^\/auth\/org\/memberships\/([^/]+)\/payments(\/preview)?$/.exec(r.path);
        if (m && r.method === "GET" && m[2]) return { json: fixture("e1_preview_300000") };
        if (m && r.method === "POST" && !m[2] && !/dry_run/.test(r.query)) { paid = true; return { status: 201, json: fixture("e1_create_300000") }; }
        return null;
      });
      const { page, errors } = await mountPage(answer, ["group", OWNER, { moneyAvailable: true, search: "tab=payments" }]);
      await page.waitForSelector('[data-testid="payments-left-toggle"]', { timeout: 9000 });
      await page.click('[data-testid="payments-left-toggle"]');
      await page.waitForSelector('[data-testid="group-payment-left-row"]');
      await page.waitForTimeout(400);
      await check(page, errors, `7-left-${width}`);
      await shot(page, `7-group-left-${width}`, width === 375);
      // п.6: the payment from the card of the group
      await page.locator('[data-testid="group-payment-left-row"]').first().getByRole("button", { name: /Внести/ }).click();
      await page.waitForSelector("#payment-amount");
      await page.fill("#payment-amount", "300000");
      await page.click('[data-testid="payment-methods"] >> text=Наличные');
      await page.waitForFunction(() => !document.querySelector('button[form="payment-form"]')?.disabled);
      await page.click('button[form="payment-form"]');
      await page.waitForFunction(() => /расчёт не закрыт 2/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => suspicious.push(`6-${width}: the band did not follow the payment`));
      await page.waitForTimeout(800);
      await check(page, errors, `6-${width}`);
      await shot(page, `6-group-after-payment-${width}`, width === 375);
      await page.close();
    }

    // п.8 the archive of a group
    {
      const impact = { groupId: "gz", groupName: F.SHORT.A, status: "active", canArchive: false, examService: "ok", blockers: [{ code: "ACTIVE_STUDENTS", count: 2, students: [{ id: "s1", name: "Иванов Али", displayId: "AL-001" }, { id: "s2", name: "Саидова Мадина Абдурахмоновна", displayId: "AL-002" }] }], autoActions: [], warnings: [] };
      const { page, errors } = await openPage(browser, "money2.entry.tsx", F.baseServer((r) => (r.path === "/auth/org/groups/gz/archive-impact" ? { json: impact } : null), F.SHORT), size);
      await page.evaluate(() => window.mount("group-archive", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupsBasePath: "/owner/groups" }));
      await page.waitForSelector('[data-testid="archive-students-stop"]');
      await page.waitForTimeout(500);
      await check(page, errors, `8-${width}`, '[role="dialog"]');
      await shot(page, `8-group-archive-${width}`);
      await page.close();
    }
  }
  await browser.close();

  // п.9 the console «Сверка денег» (the CSS of the console)
  process.env.DOM_CSS = compile(["-c", path.join(root, "console", "tailwind.config.ts")]);
  const consoleBrowser = await launch();
  const KINDS = require("../fixtures/money-reconcile/findings.json").findings;
  const RUN = { id: "r1", startedAt: "2026-11-23T01:33:00", finishedAt: "2026-11-23T01:34:00", status: "findings", centresChecked: 11, findings: 4, newFindings: 3, mail: "none", error: null };
  for (const width of [1280]) {
    const { page, errors } = await openPage(consoleBrowser, "console.entry.tsx", () => null, { width, height: 900 });
    const rows = [
      { ...KINDS.find((item) => item.details.what === "drift"), id: "f1", orgName: "Деньги-1 Календарь", isNew: true },
      { ...KINDS.find((item) => item.details.what === "identity"), id: "f2", orgName: "TestSchool", isNew: false },
    ];
    await page.evaluate((d) => window.show(d), { runs: [RUN], latest: RUN, findings: rows });
    await page.waitForSelector("table");
    await page.waitForTimeout(400);
    await check(page, errors, `9-${width}`);
    await shot(page, `9-console-${width}`, true);
    await page.close();
  }
  await consoleBrowser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious lines");
})();
