// PAY-DUE, screens part 2: `TMPDIR=<dir> node tests/dom/paydue-part2-shots.cjs <out dir>` - PNGs of the frames 11-14 and 21 of the layout by the REAL components at 1280 and 375 (and with long names), the data of
// tests/helpers/paydue-statement.cjs.  Prints ONLY suspicious lines: horizontal scroll, text off its block, errors of the page.
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
const S = require("../helpers/paydue-statement.cjs");

const OWNER = { role: "owner", org_role: "owner" };
const LONG_NAME = "Мухаммаджонова Фарангиз Абдурахмоновна-Каримова";
const LONG_GROUP = "Подготовка к олимпиаде по математике, 7 класс (углублённый курс)";
const statement = (build) => (request) => (request.path === "/auth/org/memberships/m-a/statement" ? { json: build() } : null);
const preview = (build) => (request) => (request.path === "/auth/org/memberships/m1/payments/preview" ? { json: build(Number(/amount=(\d+)/.exec(request.query)?.[1]) || null) } : null);
const stmt = (build, all = false) => ({ entry: "money2.entry.tsx", answer: statement(build), mount: ["statement", OWNER, { moneyAvailable: true }], steps: async (page) => { await page.waitForSelector('[data-testid="statement-summary"]'); if (all) { await page.getByRole("button", { name: "Все месяцы" }).click(); await page.waitForTimeout(200); } } });
const window_ = (build, amount, name = "Анвар Каримов", group = "Математика 7 Пн-Ср-Пт") => ({
  entry: "money.entry.tsx", answer: preview(build), mount: ["till", OWNER, { membership: { membership_id: "m1", group_id: "g1", student_name: name, group_name: group } }],
  steps: async (page) => { await page.waitForSelector('[data-testid="payment-due"]'); await page.waitForTimeout(400); if (amount) { await page.fill("#payment-amount", String(amount)); await page.click('[data-testid="payment-methods"] >> text=Наличные'); await page.waitForSelector('[data-testid="payment-plan-sentence"]'); } },
});

const FRAMES = [
  { name: "f11-statement-due", ...stmt(S.anvarDue) },
  { name: "f12-statement-debt", ...stmt(S.lolaDebt) },
  { name: "f13-statement-two-sums", ...stmt(S.timurTwo, true) },
  { name: "f14a-window-due", ...window_(S.anvarPreview, 231000) },
  { name: "f14b-statement-paid", ...stmt(S.anvarPaid) },
  { name: "f14c-window-two-sums", ...window_(S.timurPreview, 400000, "Тимур Рашидов") },
  { name: "f21-statement-phone-two-sums", ...stmt(S.timurTwo, true) },
  { name: "x1-statement-advance", ...stmt(S.withAdvance) },
  { name: "x2-statement-mismatch", ...stmt(S.broken) },
  { name: "x3-long-names-debt", ...stmt(() => S.timurTwo(LONG_NAME, LONG_GROUP), true) },
  { name: "y1-statement-forgiven-recalc", ...stmt(() => S.forgivenRecalc(), true) },
  { name: "y2-long-names-forgiven-recalc", ...stmt(() => S.forgivenRecalc(LONG_NAME, LONG_GROUP), true) },
  { name: "x4-long-names-window", ...window_(S.timurPreview, 400000, LONG_NAME, LONG_GROUP) },
];

(async () => {
  const browser = await launch();
  const only = process.argv[3];
  for (const frame of FRAMES) {
    if (only && !frame.name.startsWith(only)) continue;
    for (const width of [1280, 375]) {
      const height = width === 375 ? 812 : 900;
      const run = await openPage(browser, frame.entry, frame.answer, { width, height });
      try {
        const [name, user, props] = frame.mount;
        await run.page.evaluate(([n, u, p]) => window.mount(n, u, p), [name, user, props]);
        await frame.steps(run.page);
        await run.page.waitForTimeout(250);
        const probe = await run.page.evaluate(layoutProbe, "body");
        if (probe.bad.length || probe.scroll > 0) console.log(`SUSPECT ${frame.name} ${width}: ${JSON.stringify(probe).slice(0, 400)}`);
        const errors = run.errors.filter((e) => !/404|Failed to load resource/.test(e));
        if (errors.length) console.log(`ERRORS ${frame.name} ${width}: ${errors.slice(0, 2).join(" | ").slice(0, 300)}`);
        await run.page.screenshot({ path: path.join(out, `${frame.name}-${width}.png`), fullPage: true });
      } catch (error) {
        console.log(`FAILED ${frame.name} ${width}: ${String(error).slice(0, 300)}`);
      }
      await run.page.close();
    }
  }
  await browser.close();
})();
