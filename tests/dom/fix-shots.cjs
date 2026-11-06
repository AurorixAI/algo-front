// Release review fixes: `node tests/dom/fix-shots.cjs <out dir> <tailwind css>` - the screens the review named, by the REAL components, with the padding of the app layout (`main` is p-4 md:p-8 in the owner, admin and teacher
// layouts: the shots of shots.cjs mount a bare component, that was the «content at x = 0»).  Server answers are mocked here.
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
process.env.DOM_CSS = process.argv[3];
const { launch, openPage } = require("../helpers/dom-page.cjs");
const { layoutProbe, touchTargets } = require("../helpers/layout-probe.cjs");
const X = require("../helpers/money-b-fixture.cjs");
const { monthServer } = require("../helpers/month-list-fixture.cjs");

const isDry = (r) => /dry_run=(true|1)/.test(r.query);
const paymentsServer = (request) => {
  if (request.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (request.path === "/auth/org/payments/status") {
    const tab = /bucket=([a-z]+)/.exec(request.query)[1];
    const items = tab === "waiting" ? [X.WAITING] : tab === "debtors" ? [X.DEBTOR] : [];
    return { json: { items, total: items.length, limit: 50, offset: 0 } };
  }
  if (request.path === "/auth/org/groups") return { json: [{ id: "g1", name: "7-А Алгебра", teacher_id: "t1" }] };
  return null;
};
const ST = (id, first, last, extra = {}) => ({ id, first_name: first, last_name: last, full_name: `${last} ${first}`, class_level: 7, status: "new", group_id: null, current_group_id: null, groups_count: 0, ...extra });
const PARTS = [
  { label: "Октябрь", from: "2026-10-27", amount: 89000, lessons: 2, lessons_in_period: 9, whole: false },
  { label: "Ноябрь", from: "2026-11-01", amount: 400000, lessons: 8, lessons_in_period: 8, whole: true },
];
const STUDENTS = [ST("a", "Иван", "Иванов", { student_phone: "+998901231234" }), ST("b", "Иван", "Иванов", { student_phone: "+998907775599" }), ST("c", "Пётр", "Петров")];
// the mock tells ONE story: «Оплата с» is 09.11 (the first lesson) by default - nothing is charged at once (`immediate` null); a day in the past charges October from 27.10 and November whole
const drawerServer = (request) => {
  if (request.method === "GET" && request.path === "/auth/org/groups") return { json: [{ id: "g2", name: "7-Б Геометрия" }] };
  if (request.method === "GET" && request.path === "/auth/org/students") {
    const q = decodeURIComponent((/search=([^&]*)/.exec(request.query) || [, ""])[1]).toLowerCase();
    const items = STUDENTS.filter((st) => !q || st.full_name.toLowerCase().includes(q));
    return { json: { items, total: items.length } };
  }
  if (request.method === "GET" && request.path === "/auth/org/groups/g2/pay-from-default") return { json: { today: "2026-11-06", first_lesson: "2026-11-09", default_pay_from: "2026-11-09", text: "Оплата с 09.11.2026 — первое занятие группы с сегодня" } };
  if (request.method === "POST" && /\/groups\/g2\/students\//.test(request.path) && isDry(request)) {
    const from = (request.body && request.body.pay_from) || "2026-11-09";
    const past = from < "2026-11-06";
    const billing = { pay_from: from, explicit: from !== "2026-11-09", default_pay_from: "2026-11-09", first_lesson: "2026-11-09", text: `Оплата с ${from.slice(8, 10)}.${from.slice(5, 7)}.${from.slice(0, 4)}`,
      immediate: past ? { amount: 489000, lessons: 10, text: "Сразу начислится 489 000 сум", parts: PARTS } : null };
    if (request.path.endsWith("/bulk")) return { json: { dry_run: true, students: [{ student_id: "a", billing }], immediate_total: past ? { text: "Сразу начислится 489 000 сум" } : null } };
    return { json: { dry_run: true, billing } };
  }
  return null;
};
const money = (request) => paymentsServer(request) || monthServer()(request);

const W = [[1280, 900], [375, 812]];
const SHOTS = [
  { name: "01-month-list-padding-nbsp", entry: "money.entry.tsx", mount: "monthPage", server: (r) => monthServer()(r), time: "2026-11-05T10:00:00+05:00", search: "month=2026-11", frame: true },
  { name: "05-payments-status-debtors", entry: "money-b.entry.tsx", mount: "payments", props: { refresh: true, search: "bucket=debt" }, server: paymentsServer, frame: true, wait: "li" },
  { name: "05-payments-status-waiting", entry: "money-b.entry.tsx", mount: "payments", props: { refresh: true, search: "bucket=waiting" }, server: paymentsServer, frame: true, wait: "li" },
  { name: "03-enrol-parts-namesakes", entry: "money-b.entry.tsx", mount: "addDrawer", props: { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 400000, valid_from: "2026-09-01" } }, server: drawerServer, probe: '[role="dialog"]',
    act: async (page) => { await page.fill('input[placeholder^="Поиск по имени"]', "Иванов"); await page.waitForTimeout(500); await page.click('button:has-text("Иванов Иван") >> nth=0'); await page.waitForSelector('[data-testid="pay-from"]'); await page.fill("#add-student-pay-from", "27.10.2026"); await page.keyboard.press("Tab"); await page.waitForTimeout(1500); } },
  { name: "03-enrol-new-student", entry: "money-b.entry.tsx", mount: "addDrawer", props: { summary: { accountingStart: "2026-09-01" }, refresh: false, groupPrice: { amount: 400000, valid_from: "2026-09-01" } }, server: drawerServer, probe: '[role="dialog"]',
    act: async (page) => { await page.fill('input[placeholder^="Поиск по имени"]', "Петров"); await page.waitForTimeout(500); await page.click('button:has-text("Петров Пётр")'); await page.waitForTimeout(400); } },
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch();
  const report = [];
  for (const shot of SHOTS) {
    for (const [width, height] of W) {
      const { page, errors } = await openPage(browser, shot.entry, shot.server, { width, height });
      if (shot.frame) await page.addStyleTag({ content: `#root{padding:${width >= 768 ? 32 : 16}px}` });
      if (shot.time) await page.clock.setFixedTime(new Date(shot.time));
      if (shot.search) await page.evaluate((s) => { window.__search = s; }, shot.search);
      await page.evaluate(([name, props]) => window.mount(name, { role: "owner", org_role: "owner" }, props), [shot.mount, shot.props ?? {}]);
      try { if (shot.wait) await page.waitForSelector(shot.wait, { timeout: 4000 }); if (shot.act) await shot.act(page); else await page.waitForTimeout(900); } catch (error) { report.push(`${shot.name} ${width}: ACT FAILED ${String(error).split("\n")[0].slice(0, 120)}`); }
      const sel = shot.probe ?? "body";
      const layout = await page.evaluate(layoutProbe, sel);
      const small = await page.evaluate(touchTargets, sel);
      const left = await page.evaluate(() => { const r = document.querySelector("#root > *")?.getBoundingClientRect(); return r ? Math.round(r.left) : null; });
      await page.screenshot({ path: path.join(out, `${shot.name}-${width}.png`), fullPage: !shot.probe });
      report.push(`${shot.name} ${width}: layout=${layout.bad.length ? JSON.stringify(layout.bad.slice(0, 2)) : "ok"} contentLeft=${left} small(<40)=${small.length}${small.length ? " " + JSON.stringify(small.slice(0, 3)) : ""} errors=${errors.length}`);
      await page.close();
    }
  }
  await browser.close();
  console.log(report.join("\n"));
})();
