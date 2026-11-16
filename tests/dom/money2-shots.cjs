// Money-2 wave 1: `node tests/dom/money2-shots.cjs <out dir>` - PNGs of every new / changed window at 1280, 1024 and 375 by the REAL components, on the worst real case (a student in three groups with long names;
// a pause + a planned price + a debt at once; a cancelled payment that was already restored).  Prints ONLY suspicious lines: horizontal scroll, a control outside the screen.
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

const day = (shift) => new Date(Date.now() + shift * 86400000).toISOString().slice(0, 10);
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const isDry = (r) => /dry_run=true/.test(r.query);
const UNDO = { undone: true, text: "Ученик вернулся в день ухода — уход отменён: цены и паузы возвращены", restored: [{ code: "individual_price", text: `Индивидуальная цена 300 000 сум в группе «${F.A}» возвращена` }, { code: "pause", text: "Пауза 23.11–26.11 возвращена" }] };
const OTHER = `В группе «${F.T}» аванс уменьшится на 30 000 сум — до 390 000 сум`;
const pause = (id, first, last) => ({ id, membership_id: "m-a", first_day: first, last_day: last, days: 4, reason: null, created_by_name: null, created_at: null, voided_at: null, void_reason: null });
const saved = (p, extra = {}) => ({ pause: p, impact: { charged_delta: -80000, paid_until_before: null, paid_until_after: null, debt_before: 0, debt_after: 0, advance_before: 0, advance_after: 0 }, lessons: { excluded: [], attended: [] }, payroll: null, dry_run: true, row: null, other_groups_text: OTHER, ...extra });

const SHOTS = [
  { name: "transfer", mount: ["assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, sourceGroups: F.SOURCES, excludeGroupIds: ["ga", "gb", "gc"] }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(r), effects: F.transferEffects(), leave_undo: UNDO } } : null),
    steps: async (page) => { await page.click(`text=${F.T.slice(0, 20)}`); await page.locator('[data-testid="assign-current-group"]').count(); await page.click("#assign-group-source"); await page.click(`[role="option"]`.concat(":has-text(\"Геометрия 8\")")); await page.waitForSelector('[data-testid="transfer-effects"]'); } },
  { name: "transfer-source", mount: ["assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, sourceGroups: F.SOURCES, excludeGroupIds: ["ga", "gb", "gc"] }],
    server: F.baseServer(() => null), steps: async (page) => { await page.click(`text=${F.T.slice(0, 20)}`); await page.waitForTimeout(500); } },
  { name: "transfer-nomoney", mount: ["assign", { role: "admin", org_role: "admin" }, { moneyAvailable: false, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: isDry(r), effects: F.transferEffects({ money: false }) } } : null),
    steps: async (page) => { await page.click(`text=${F.T.slice(0, 20)}`); await page.waitForSelector('[data-testid="transfer-effects"]'); } },
  { name: "transfer-changed", mount: ["assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, sourceGroups: [F.SOURCES[0]], excludeGroupIds: ["ga"] }],
    server: F.baseServer((r) => { if (r.path !== "/auth/org/groups/gt/students/st1") return null; return isDry(r) ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, effects: F.transferEffects({ carried: 465000 }) } } : { status: 409, json: { detail: { code: "BALANCE_CHANGED", message: "Данные оплат изменились — проверьте числа", carried: 440000 } } }; }),
    steps: async (page) => { await page.click(`text=${F.T.slice(0, 20)}`); await page.waitForSelector('[data-testid="transfer-effects"]'); await page.click('[data-testid="assign-submit"]'); await page.waitForSelector('[data-testid="transfer-changed"]'); await page.waitForTimeout(600); } },
  { name: "add-undo", mount: ["assign", { role: "owner", org_role: "owner" }, { moneyAvailable: true, mode: "add", currentGroupName: "Алгебра", excludeGroupIds: ["ga"] }],
    server: F.baseServer((r) => r.path === "/auth/org/groups/gt/students/st1" ? { json: { student_id: "st1", group_id: "gt", status: "added", dry_run: true, leave_undo: UNDO } } : null),
    steps: async (page) => { await page.click(`text=${F.T.slice(0, 20)}`); await page.waitForSelector('[data-testid="leave-undo"]'); } },
  { name: "leave", mount: ["leave"], server: F.baseServer((r) => r.path === "/auth/org/groups/ga/students/st1/leave-preview" ? { json: { as_of: "2026-11-16", memberships: [F.leaveMembership(0)] } } : null), steps: async (page) => { await page.waitForSelector('[data-testid="effects-ends"]'); } },
  { name: "archive", mount: ["archive"], server: F.baseServer((r) => r.path === "/auth/org/students/st1/archive-preview" ? { json: { as_of: "2026-11-16", memberships: [0, 1, 2].map((i) => F.leaveMembership(i, { kind: "archive" })) } } : null), steps: async (page) => { await page.waitForSelector('[data-testid="effects-ends"]'); } },
  { name: "archive-nomoney", mount: ["archive", { role: "admin", org_role: "admin" }], server: F.baseServer((r) => r.path === "/auth/org/students/st1/archive-preview" ? { json: { as_of: "2026-11-16", memberships: [0, 1].map((i) => F.leaveMembership(i, { money: false, kind: "archive" })) } } : null), steps: async (page) => { await page.waitForSelector('[data-testid="effects-ends"]'); } },
  { name: "statement-cancelled", mount: ["statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }],
    server: F.baseServer((r) => r.path === "/auth/org/memberships/m-a/statement" ? { json: F.statementWithVoided() } : r.path === "/auth/org/memberships/m-a/payments" ? { json: F.paymentsList() } : null),
    steps: async (page) => { await page.waitForSelector('[data-testid="statement-months"]'); await page.getByText("Показать отменённые").click(); await page.waitForSelector('[data-testid="statement-restore"]'); await page.locator('section[aria-label="Отменённые записи"]').scrollIntoViewIfNeeded(); } },
  { name: "restore", mount: ["statement", { role: "owner", org_role: "owner" }, { moneyAvailable: true }],
    server: F.baseServer((r) => r.path === "/auth/org/memberships/m-a/statement" ? { json: F.statementWithVoided() } : r.path === "/auth/org/memberships/m-a/payments" ? { json: F.paymentsList() } : r.path === "/auth/org/payments/p3/restore" ? { status: 201, json: { payment: F.paymentsList()[2], money_effects: { dryRun: true, text: `В группе «${F.T}» аванс вырастет на 390 000 сум — до 390 000 сум`, students: [], payroll: [] } } } : null),
    steps: async (page) => { await page.waitForSelector('[data-testid="statement-months"]'); await page.getByText("Показать отменённые").click(); await page.waitForSelector('[data-testid="statement-restore"]'); await page.getByRole("button", { name: "Восстановить оплату" }).click(); await page.waitForSelector('[data-testid="money-effects"][data-state="ready"]'); } },
  { name: "pause-create", mount: ["pause", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: F.A }],
    server: F.baseServer((r) => r.path === "/auth/org/memberships/m-a/pauses" ? (r.method === "GET" ? { json: [pause("pr", day(-2), day(3)), pause("pf", day(10), day(13))] } : { json: saved(pause("pn", day(1), day(4))) }) : null),
    steps: async (page) => { await page.waitForSelector('section[aria-label="Паузы ученика"]'); await page.fill("#pause-first", dmy(day(1))); await page.fill("#pause-last", dmy(day(4))); await page.waitForFunction(() => /аванс/.test(document.querySelector('[data-testid="pause-calc"]')?.textContent ?? "")); } },
  { name: "pause-cancel", mount: ["pause", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: F.A }],
    server: F.baseServer((r) => { if (r.path === "/auth/org/memberships/m-a/pauses") return { json: [pause("pr", day(-2), day(3)), pause("pf", day(10), day(13))] }; if (r.path === "/auth/org/pauses/pf/void") return { status: 409, json: { detail: { code: "PAUSE_BREAKS_REFUND", message: `Из группы «${F.T}» уже возвращены деньги, которые перешли туда из этой группы: 390 000 сум. Сначала отмените возврат в группе «${F.T}»` } } }; return null; }),
    steps: async (page) => { await page.waitForSelector('section[aria-label="Паузы ученика"]'); await page.getByRole("button", { name: "Отменить паузу" }).first().click(); await page.waitForSelector('[data-testid="pause-act-effects"]'); } },
  { name: "refund-refused", mount: ["refund", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: F.A }],
    server: F.baseServer((r) => r.method === "POST" ? { status: 422, json: { detail: { code: "REFUND_EXCEEDS_ADVANCE", message: `Аванс ученика перешёл в группу «${F.T}» — возврат оформите там`, refundable: 0 } } } : null),
    steps: async (page) => { await page.getByRole("radio", { name: "Наличные" }).click(); await page.fill("#refund-reason", "Ученик ушёл"); await page.locator('[role="dialog"] button[type="submit"]').click(); await page.waitForSelector('[role="dialog"] [role="status"], [role="dialog"] [role="alert"]'); await page.waitForTimeout(300); } },
  { name: "journal", mount: ["decisions"], server: F.baseServer((r) => (r.path === "/auth/org/payments/decisions" ? { json: F.decisionsPage() } : null)), steps: async (page) => { await page.waitForSelector('[data-testid="decision-row"]'); } },
];

(async () => {
  const browser = await launch();
  for (const shot of SHOTS) {
    for (const width of [1280, 1024, 375]) {
      const run = await openPage(browser, "money2.entry.tsx", shot.server, { width, height: width === 375 ? 800 : 900 });
      try {
        const [name, user, props] = shot.mount;
        await run.page.evaluate(([n, u, p]) => window.mount(n, u ?? { role: "owner", org_role: "owner" }, p ?? {}), [name, user, props]);
        await shot.steps(run.page);
        await run.page.waitForTimeout(250);
        const probe = await run.page.evaluate(() => {
          const wide = document.documentElement.scrollWidth > window.innerWidth + 1;
          const dialog = document.querySelector('[role="dialog"]');
          const box = dialog?.getBoundingClientRect();
          const cut = dialog ? [...dialog.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0 && ["P", "LI", "SPAN", "H4"].includes(el.tagName) && el.getBoundingClientRect().right > (box.right + 1)).length : 0;
          return { wide, boxRight: box ? Math.round(box.right) : null, vw: window.innerWidth, cut };
        });
        if (probe.wide || probe.cut || (probe.boxRight !== null && probe.boxRight > probe.vw)) console.log(`SUSPECT ${shot.name} ${width}: ${JSON.stringify(probe)}`);
        if (run.errors.length) console.log(`ERRORS ${shot.name} ${width}: ${run.errors.slice(0, 2).join(" | ").slice(0, 200)}`);
        await run.page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`), fullPage: false });
        // a window taller than the screen: the second shot is its bottom (what changes, the buttons)
        const scrolled = await run.page.evaluate(() => { const els = [...document.querySelectorAll('[role="dialog"] *')].filter((el) => el.scrollHeight > el.clientHeight + 8 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)); els.forEach((el) => { el.scrollTop = el.scrollHeight; }); return els.length; });
        if (scrolled) { await run.page.waitForTimeout(150); await run.page.screenshot({ path: path.join(out, `${shot.name}-${width}-end.png`), fullPage: false }); }
      } catch (error) { console.log(`FAIL ${shot.name} ${width}: ${String(error).slice(0, 160)}`); }
      await run.page.close();
    }
  }
  await browser.close();
  console.log("done");
})();
