// PAY-TAILS Б11.51 (part 20, screens part 2): `node tests/dom/paytails-part20-shots2.cjs <out dir>` - the PNGs of the window of a pause with the two new quiet lines, of the window of a return, of the window of a payment (future
// cancellations of the centre) and of the history of enrolments of the REAL profile, 1280 and 375, «<состояние>-<ширина>.png»; prints the words of the windows (texts.json in the out dir).  Real answers: tests/fixtures/paytails.
// Prints ONLY suspicious things (sideways scroll, a console error).
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
const { contract, pauseServer, setWorld, dmy } = require("../helpers/paytails-part16.cjs");
const F = require("../helpers/money2-fixture.cjs");
const X = require("../helpers/paydue-fixture.cjs");
const { TOSHMATOV } = require("../helpers/stage-numbers.cjs");

const real = (name) => JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "paytails", "part20", `${name}.json`), "utf8"));
const OWNER = { role: "owner", org_role: "owner" };
const plain = (text) => text.replace(/[\s  ]+/g, " ").trim();
const suspicious = [];
const texts = {};
const dry = (r) => /dry_run=true/.test(r.query);
setWorld("2026-11-25");

const returnServer = (answer) => F.baseServer((r) => {
  if (r.method === "GET" && r.path === "/auth/org/groups/gt/pay-from-default") return { json: { today: "2026-11-26", first_lesson: "2026-11-26", default_pay_from: "2026-11-26", text: "Оплата с 26.11.2026 — сегодня у группы занятие" } };
  if (r.method === "POST" && r.path === "/auth/org/groups/gt/students/st1") return { json: { ...answer, dry_run: dry(r), status: "added" } };
  return null;
}, F.SHORT);
const PROFILE = real("student_profile_former_stay");
const PAUSES = real("pauses_list_former_stay");
const profileServer = (r) => {
  if (/^\/auth\/org\/students\/[^/]+\/profile$/.test(r.path)) return { json: PROFILE };
  if (/^\/auth\/org\/students\/[^/]+\/memberships$/.test(r.path)) return { json: [] };
  const m = /^\/auth\/org\/memberships\/([^/]+)\/pauses$/.exec(r.path);
  if (m) return { json: PAUSES.filter((p) => p.membership_id === m[1]) };
  if (r.path === "/auth/org/payments/summary") return { json: X.SUMMARY };
  if (r.path === "/auth/org/payments/status") return { json: X.statusPage(r.query) };
  if (r.path === "/auth/org/settings/payments") return { json: X.SETTINGS };
  return null;
};
const pauseState = (name) => ({
  page: "money2.entry.tsx", today: "2026-11-25",
  server: () => { const a = contract(name); return pauseServer({ pauses: [], create: (r) => ({ json: { ...a, dry_run: dry(r) } }) }); },
  mount: ["pause", { moneyAvailable: true }],
  act: async (page) => { const a = contract(name); await page.waitForSelector("#pause-first"); await page.fill("#pause-first", dmy(a.pause.first_day)); await page.fill("#pause-last", dmy(a.pause.last_day)); await page.waitForSelector('[data-testid="pause-money"]'); await page.waitForTimeout(400); },
  text: '[data-testid="pause-calc"]', clip: '[role="dialog"]',
});
const returnState = (name, pick) => ({
  page: "money2.entry.tsx", today: "2026-11-26", server: () => returnServer(real(name)),
  mount: ["assign", { moneyAvailable: true, groupsBasePath: "/owner/groups", mode: "add", currentGroupName: F.SHORT.A, excludeGroupIds: ["ga"], sourceGroups: [{ id: "ga", name: F.SHORT.A }] }],
  act: async (page) => { await page.click('[data-testid="assign-group-card"][data-group="gt"] [data-testid="group-card-name"]'); await page.waitForSelector('[data-testid="enrol-terms-why"]'); if (pick) await pick(page); await page.waitForTimeout(600); },
  text: '[role="dialog"]', clip: '[role="dialog"]',
});
const payState = (name) => ({
  page: "money.entry.tsx", today: "2026-11-25",
  server: () => (r) => (r.method === "GET" && r.path === "/auth/org/memberships/m1/payments/preview" ? { json: /amount=\d+/.test(r.query) ? real(name) : { ...real(name), amount: null, result: null } } : null),
  mount: ["till", null], mountArgs: [undefined, { membership: TOSHMATOV }],
  act: async (page) => { await page.waitForTimeout(500); await page.fill("#payment-amount", String(real(name).amount)); await page.click('[data-testid="payment-methods"] >> text=Наличные'); await page.waitForSelector('[data-testid="payment-split"]'); await page.waitForTimeout(500); },
  text: '[data-testid="payment-calc"]', clip: '[role="dialog"]',
});
const states = {
  pause_centre_cancel: pauseState("pause_probe_create_with_centre_cancel"),
  pause_forgiveness_cut: pauseState("pause_probe_create_with_forgiveness_cut"),
  return_same_period: returnState("return_preview_no_break"),
  return_pay_from: returnState("return_preview_pay_from", async (page) => { await page.click('[data-testid="enrol-terms-toggle"]'); await page.fill("#assign-group-pay-from", "27.11.2026"); }),
  payment_future_cancel_closed: payState("payment_preview_future_cancel_closed"),
  payment_future_cancel_part: payState("payment_preview_future_cancel_part"),
};

(async () => {
  const browser = await launch();
  for (const width of [1280, 375]) {
    for (const [name, s] of Object.entries(states)) {
      const { page, errors } = await openPage(browser, s.page, s.server(), { width, height: width === 375 ? 1400 : 1000, today: s.today });
      if (s.mountArgs) await page.evaluate(([n, u, p]) => window.mount(n, u, p), [s.mount[0], ...s.mountArgs]);
      else await page.evaluate(([n, u, p]) => window.mount(n, u, p), [s.mount[0], OWNER, s.mount[1]]);
      await s.act(page);
      const label = `${name}-${width}`;
      texts[label] = plain(await page.locator(s.text).first().innerText());
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const bad = errors.filter((t) => !/Failed to load resource/.test(t));
      if (scroll > 0 || bad.length) suspicious.push(`${label}: scroll ${scroll} errors ${JSON.stringify(bad).slice(0, 200)}`);
      const box = await page.locator(s.clip).first().boundingBox();
      await page.screenshot({ path: path.join(out, `${label}.png`), clip: { x: 0, y: 0, width, height: Math.min(1400, Math.ceil(box.y + box.height + 24)) } });
      await page.close();
    }
    const { page, errors } = await openPage(browser, "paydue.entry.tsx", profileServer, { width, height: width === 375 ? 1500 : 1100, today: "2026-11-25" });
    await page.evaluate(([who]) => window.mount("student", who, { moneyAvailable: true }), [OWNER]);
    await page.waitForSelector("text=История зачислений и переводов", { timeout: 8000 });
    await page.waitForSelector('[data-testid="former-pauses"]');
    await page.waitForTimeout(600);
    await page.locator("text=История зачислений и переводов").scrollIntoViewIfNeeded();
    const block = page.locator("text=История зачислений и переводов").locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await block.screenshot({ path: path.join(out, `history_real_profile-${width}.png`) });
    await page.locator('[data-testid="former-pauses"]').click();
    await page.waitForSelector('[data-testid="pause-card"]');
    await page.waitForTimeout(400);
    texts[`history_window-${width}`] = plain(await page.locator('[role="dialog"]').innerText());
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (scroll > 0 || errors.filter((t) => !/Failed to load resource/.test(t)).length) suspicious.push(`history-${width}: scroll ${scroll}`);
    const box = await page.locator('[role="dialog"]').boundingBox();
    await page.screenshot({ path: path.join(out, `history_real_window-${width}.png`), clip: { x: 0, y: 0, width, height: Math.min(1500, Math.ceil(box.y + box.height + 24)) } });
    await page.close();
  }
  fs.writeFileSync(path.join(out, "texts.json"), JSON.stringify(texts, null, 1));
  await browser.close();
  console.log(suspicious.length ? suspicious.join("\n") : "no suspicious");
})();
