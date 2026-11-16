// Money-2 wave 2: `node tests/dom/money2-w2-shots.cjs <out dir>` - PNGs of every new / changed window at 1280, 1024 and 375 in TWO sets: `normal-…` (short names - readability) and `long-…` (the longest names - wraps only).
// Prints ONLY suspicious lines (horizontal scroll, a window outside the screen).
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
const F = require("../helpers/money2-fixture.cjs");
const X = require("../helpers/money-b-fixture.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const isDry = (r) => /dry_run=true/.test(r.query);
const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
const pick = (page) => page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]');

const scenes = (N) => [
  { name: "enrol-add", entry: "money2.entry.tsx", mount: ["assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: N.A, excludeGroupIds: ["ga"], groupsBasePath: "/owner/groups" }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, past_balances: [{ group_id: "gb", group_name: N.B, membership_id: "m9", left_on: "2026-11-10", kind: "debt", amount: 120000, text: `${N.B} (ушёл 10.11): долг 120 000 сум` }, { group_id: "gc", group_name: N.C, membership_id: "m8", left_on: "2026-10-28", kind: "advance", amount: 80000, text: `${N.C} (ушёл 28.10): аванс 80 000 сум` }] } } : null, N),
    steps: async (page) => { await pick(page); await page.waitForSelector('[data-testid="past-balances"]'); } },
  { name: "enrol-cards", entry: "money2.entry.tsx", mount: ["assign", OWNER, { moneyAvailable: true, mode: "add", currentGroupName: N.A, excludeGroupIds: ["ga"] }], server: F.baseServer(() => null, N), steps: async (page) => { await page.waitForSelector('[data-testid="assign-group-card"]'); await page.locator('[data-testid="assign-group-card"][data-group="gt"] summary').click(); } },
  { name: "transfer", entry: "money2.entry.tsx", mount: ["assign", OWNER, { moneyAvailable: true, sourceGroups: [F.sourcesOf(N)[0]], excludeGroupIds: ["ga"], currentGroupName: N.A }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(r), effects: F.transferEffects({ names: N }) } } : null, N),
    steps: async (page) => { await pick(page); await page.waitForSelector('[data-testid="transfer-effects"]'); } },
  { name: "leave", entry: "money2.entry.tsx", mount: ["leave", OWNER, {}], server: F.baseServer((r) => r.path === "/auth/org/groups/ga/students/st1/leave-preview" ? { json: { as_of: "2026-11-16", memberships: [F.leaveMembership(0, { names: N })] } } : null, N), steps: async (page) => { await page.waitForSelector('[data-testid="effects-ends"]'); } },
  { name: "pause-cancel", entry: "money2.entry.tsx", mount: ["pause", OWNER, { moneyAvailable: true, groupName: N.A }],
    server: F.baseServer((r) => { const pf = { id: "pf", membership_id: "m-a", first_day: day(10), last_day: day(13), days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null }; if (r.path === "/auth/org/memberships/m-a/pauses") return { json: [pf] }; if (r.path === "/auth/org/pauses/pf/void") return { json: { pause: pf, impact: null, row: null, dry_run: true, advance_drops: [{ membership_id: "m-b", group_id: "gt", group_name: N.T, amount: 30000, total: 410000 }], other_groups_text: `В группе «${N.T}» аванс уменьшится на 30 000 сум — до 410 000 сум` } }; return null; }, N),
    steps: async (page) => { await page.waitForSelector('section[aria-label="Паузы ученика"]'); await page.getByRole("button", { name: "Отменить паузу" }).first().click(); await page.waitForSelector('[data-testid="pause-act-effects"]'); } },
  { name: "restore", entry: "money2.entry.tsx", mount: ["statement", OWNER, { moneyAvailable: true }],
    server: F.baseServer((r) => r.path === "/auth/org/memberships/m-a/statement" ? { json: F.statementWithVoided(N) } : r.path === "/auth/org/memberships/m-a/payments" ? { json: F.paymentsList().map((p) => p.id === "p2" ? { ...p, created_at: "2026-11-25T07:00:00" } : p) } : r.path === "/auth/org/payments/p3/restore" ? { status: 201, json: { payment: { ...F.paymentsList()[2], id: "p4" }, other_gains: [{ group_name: N.T, advance_grew: 390000, advance: 390000, debt_fell: 0, debt: 0 }], money_effects: { dryRun: true, text: `В группе «${N.T}» аванс вырастет на 390 000 сум — до 390 000 сум`, students: [], payroll: [] } } } : null, N),
    steps: async (page) => { await page.waitForSelector('[data-testid="statement-months"]'); await page.getByText("Показать отменённые").click(); await page.waitForSelector('[data-testid="statement-restore"]'); await page.getByRole("button", { name: "Восстановить оплату" }).first().click(); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "journal", entry: "money2.entry.tsx", mount: ["decisions", OWNER, {}], server: F.baseServer((r) => r.path === "/auth/org/payments/decisions" ? { json: F.decisionsPage(N) } : null, N), steps: async (page) => { await page.waitForSelector('[data-testid="decision-row"]'); } },
  { name: "group-archive", entry: "money2.entry.tsx", mount: ["group-archive", OWNER, { groupName: N.A, groupsBasePath: "/owner/groups" }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gz/archive-impact" ? { json: { groupId: "gz", groupName: N.A, status: "active", canArchive: false, examService: "ok", blockers: [{ code: "OPEN_BALANCES", count: 2, balances: [{ student_id: "s1", membership_id: "m1", name: "Иванов Али", left_on: "2026-11-20", kind: "debt", amount: 190000, text: "Иванов Али: долг 190 000 сум — принять оплату или простить его можно в выписке группы", actions: [{ code: "payment", label: "Принять оплату" }, { code: "writeoff", label: "Простить долг" }] }, { student_id: "s2", membership_id: "m2", name: "Саидова Мадина", left_on: "2026-11-02", kind: "advance", amount: 80000, text: "Саидова Мадина: аванс 80 000 сум", actions: [{ code: "refund", label: "Вернуть аванс" }] }] }], autoActions: [], warnings: [] } } : null, N),
    steps: async (page) => { await page.waitForSelector('[data-testid="archive-balance"]'); } },
  { name: "writeoff", entry: "money2.entry.tsx", mount: ["writeoff", OWNER, { moneyAvailable: true, groupName: N.A }],
    server: F.baseServer((r) => r.method === "POST" && /writeoffs$/.test(r.path) ? { status: 201, json: { writeoff: {}, row: {}, money_effects: { text: "", students: [], payroll: [], forgiveness: { teacher_pay: 125000, text: "Долг будет прощён. Эти уроки будут оплачены преподавателю: зарплата за ноябрь вырастет на 125 000 сум" } } } } : null, N),
    steps: async (page) => { await page.waitForSelector('[data-testid="forgiveness-row"]'); } },
  { name: "ages", entry: "money-b.entry.tsx", mount: ["payments", OWNER, { refresh: true, search: "bucket=debt" }],
    server: (r) => { if (r.path === "/auth/org/payments/summary") return { json: { ...X.SUMMARY, debt_split: { ...X.SPLIT, debtors: 4, debtors_memberships: 4, debtors_debt_total: 1500000 }, debt_ages: [{ bucket: "to_30", students: 2, memberships: 2, debt_total: 450000 }, { bucket: "31_60", students: 0, memberships: 0, debt_total: 0 }, { bucket: "61_90", students: 1, memberships: 1, debt_total: 450000 }, { bucket: "over_90", students: 1, memberships: 1, debt_total: 600000 }] } }; if (r.path === "/auth/org/payments/status") { const items = [X.ROW({ membership_id: "a", student_name: "Алиев Тимур", debt: 300000, days_overdue: 12, debt_age_days: 12, tab: "debtors", group_name: N.A }), X.ROW({ membership_id: "b", student_id: "sb", student_name: "Бекова Лола", debt: 450000, days_overdue: null, debt_age_days: 62, tab: "debtors", group_name: N.B })]; return { json: { items, total: 2, limit: 50, offset: 0 } }; } if (r.path === "/auth/org/groups") return { json: [{ id: "g1", name: N.A, teacher_id: "t1" }] }; return null; },
    steps: async (page) => { await page.waitForSelector('[data-testid="debt-ages"]'); await page.waitForSelector('[data-testid="status-cell"]'); } },
];

const NAMES = ["Иванов Иван", "Каримов Фарход", "Саидова Мадина", "Юсупов Бекзод"];
const STUDENTS = NAMES.map((full, i) => ({ id: `st${i + 1}`, first_name: full.split(" ")[1], last_name: full.split(" ")[0], full_name: full, class_level: 7, status: "active", group_id: null, current_group_id: null, groups_count: 0 }));
const bulkScene = (N) => ({ name: "bulk-outcome", entry: "enrol.entry.tsx", enrol: true,
  server: (r) => {
    if (r.method === "GET" && r.path === "/auth/org/groups") return { json: [{ id: "g2", name: N.A }] };
    if (r.method === "GET" && r.path === "/auth/org/students") return { json: { items: STUDENTS, total: 4 } };
    if (r.method === "POST" && r.path === "/auth/org/groups/g2/students/bulk") { const results = STUDENTS.map((s) => (s.id === "st2" ? { student_id: s.id, status: "skipped", code: "PAY_FROM_RANGE", reason: "«Оплата с» не раньше 21.11.2026" } : { student_id: s.id, status: "added" })); return { json: { added: 3, skipped: 1, results, skipped_details: [], warnings: [] } }; }
    return null;
  },
  steps: async (page) => { for (const name of NAMES) { await page.fill('input[placeholder^="Поиск по имени"]', name.split(" ")[0].slice(0, 3)); await page.click(`button:has-text("${name}")`); } await page.click('[data-testid="enrol-submit"]'); await page.waitForSelector('[data-testid="bulk-outcome"]'); } });

(async () => {
  const browser = await launch();
  for (const [setName, N] of [["normal", F.SHORT], ["long", F.LONG]]) {
    for (const scene of [...scenes(N), bulkScene(N)]) {
      for (const width of [1280, 1024, 375]) {
        const run = await openPage(browser, scene.entry, scene.server, { width, height: width === 375 ? 800 : 900 });
        try {
          if (scene.enrol) await run.page.evaluate((u) => window.mount(u), OWNER);
          else { const [name, user, props] = scene.mount; await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user, props]); }
          await scene.steps(run.page);
          await run.page.waitForTimeout(250);
          const probe = await run.page.evaluate(() => { const dialog = document.querySelector('[role="dialog"]'); const box = dialog?.getBoundingClientRect(); return { wide: document.documentElement.scrollWidth > window.innerWidth + 1, boxRight: box ? Math.round(box.right) : null, vw: window.innerWidth }; });
          if (probe.wide || (probe.boxRight !== null && probe.boxRight > probe.vw)) console.log(`SUSPECT ${setName}-${scene.name} ${width}: ${JSON.stringify(probe)}`);
          if (run.errors.length) console.log(`ERRORS ${setName}-${scene.name} ${width}: ${run.errors.slice(0, 2).join(" | ").slice(0, 200)}`);
          await run.page.screenshot({ path: path.join(out, `${setName}-${scene.name}-${width}.png`), fullPage: false });
          const scrolled = await run.page.evaluate(() => { const els = [...document.querySelectorAll('[role="dialog"] *')].filter((el) => el.scrollHeight > el.clientHeight + 8 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)); els.forEach((el) => { el.scrollTop = el.scrollHeight; }); return els.length > 0; });
          if (scrolled) { await run.page.waitForTimeout(150); await run.page.screenshot({ path: path.join(out, `${setName}-${scene.name}-${width}-end.png`), fullPage: false }); }
        } catch (error) { console.log(`FAIL ${setName}-${scene.name} ${width}: ${String(error).slice(0, 160)}`); }
        await run.page.close();
      }
    }
  }
  await browser.close();
  console.log("done");
})();
