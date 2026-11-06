// R4 fixes of the list of salaries and of the touch targets (Д5, Д6, Д7) and the source pins of Д4, Д8, Д12, in a real browser with the project's tailwind.
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const { monthServer, KAMOL, SABINA } = require("./helpers/month-list-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").trim();
async function openMonth(width, server = monthServer()) {
  const run = await openPage(browser, "money.entry.tsx", server, { width, height: 900 });
  await run.page.clock.setFixedTime(new Date("2026-11-05T10:00:00+05:00"));
  await run.page.evaluate(() => { window.__search = "month=2026-11"; window.mount("monthPage", { role: "owner", org_role: "owner" }); });
  await run.page.waitForSelector('[data-testid="month-tile-accrued"]');
  return run;
}
/** The visible interactive elements smaller than 40 px in a side (a checkbox / radio: its invisible input is the target, so the box is measured by the input). */
const small = (page, scope = "body") => page.evaluate((sel) => {
  const out = [];
  for (const el of document.querySelectorAll(`${sel} button, ${sel} a[href], ${sel} [role="tab"], ${sel} input:not([type=hidden]), ${sel} select`)) {
    if (el.closest(".sr-only") || el.closest("[hidden]")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio") && style.opacity === "0" && rect.width < 40) { out.push(`${el.type} ${Math.round(rect.width)}x${Math.round(rect.height)}`); continue; }
    if (rect.height < 39.5 || (el.getAttribute("aria-label") && !el.textContent.trim() && rect.width < 39.5)) out.push(`${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
  }
  return out;
}, scope);

test("Д6: «Требует действия · N» is ONE line at 1280 (nowrap)", async () => {
  const { page } = await openMonth(1280);
  // the real layout has the sidebar (240 px) and the padding of the content: the harness has neither
  await page.evaluate(() => { document.body.style.paddingLeft = "240px"; });
  const lines = await page.evaluate(() => [...document.querySelectorAll('[data-testid="status-todo"]')].map((el) => ({ text: el.textContent.trim(), height: Math.round(el.getBoundingClientRect().height), lineHeight: parseFloat(getComputedStyle(el).lineHeight) || 16 })));
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.ok(line.height < line.lineHeight * 2 + 4, JSON.stringify(lines));
  await page.screenshot({ path: path.join(os.tmpdir(), "r4fix-month-1280.png"), fullPage: true });
  await page.close();
});

test("Д5: when every salary is saved the month says it ONCE: «сохранено 2 из 2», no hint under the button", async () => {
  const server = monthServer({ teachers: [SABINA, { ...SABINA, teacher_id: "t9", teacher_name: "Назарова Вера", sheet: { ...SABINA.sheet, id: "s9" } }] });
  const { page } = await openMonth(1280, server);
  const body = plain(await page.innerText("body"));
  assert.match(body, /сохранено 2 из 2/);
  assert.doesNotMatch(body, /Зарплата сохранена у всех/);
  assert.equal(await page.locator("#payroll-calculate-hint").count(), 0);
  await page.close();
});

test("Д7: on 375 every button, tab and link of the list of salaries is >= 40 px (the arrows of the month, the chips)", async () => {
  const { page } = await openMonth(375);
  assert.deepEqual(await small(page, "main, body"), []);
  await page.close();
});

test("Д4 / Д8 / Д12: the journal says «Не состоялся» once, the correction bar is on the phone, the window ends with ConfirmFooter", () => {
  const source = fs.readFileSync(path.join(root, "src", "components", "groups", "group-attendance-journal.tsx"), "utf8");
  assert.match(source, /\.filter\(\(mark\) => !\(lessonStatus === "cancelled" && mark\.text === LESSON_CANCELLED_LABEL\)\)/, "Д4");
  assert.match(source, /data-testid="correction-phone-bar"/, "Д8");
  assert.match(source, /flex flex-col gap-1 pt-1\.5 max-sm:hidden/, "Д8: the head buttons are not drawn under the pinned column on a phone");
  const window = source.slice(source.indexOf("{/* Correction of a completed lesson */}"));
  assert.match(window.slice(0, 1800), /<ConfirmFooter[\s\S]*primary="Сохранить исправление"[\s\S]*testId="correction-submit"/, "Д12");
  assert.doesNotMatch(window.slice(0, 1200), />Назад<\/button>/, "Д12: no «Назад»");
});
