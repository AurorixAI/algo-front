// Money-2 wave 1, Т8: the refusal of a refund from a closed stay whose advance went to another group is the SERVER's sentence with the name of that group - once, no own wording next to it - and the window
// cannot be sent again (the server said there is nothing to give back here: `refundable` 0).
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { launch, openPage } = require("./helpers/dom-page.cjs");
const F = require("./helpers/money2-fixture.cjs");

const root = path.join(__dirname, "..");
let browser;
test.before(async () => {
  const css = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "algo-css-")), "tw.css");
  execFileSync(process.execPath, [path.join(root, "node_modules", "tailwindcss", "lib", "cli.js"), "-i", path.join(root, "src", "app", "globals.css"), "-o", css], { cwd: root, stdio: "pipe" });
  process.env.DOM_CSS = css;
  browser = await launch();
});
test.after(async () => { await browser.close(); });

const plain = (text) => text.replace(/\s+/g, " ").replace(/ /g, " ").trim();
const SAID = `Аванс ученика перешёл в группу «${F.T}» — возврат оформите там`;

test("Т8: 422 `REFUND_EXCEEDS_ADVANCE` with `refundable` 0 - the server's sentence with the group, once; the button is off and says no sentence of its own", async () => {
  const run = await openPage(browser, "money2.entry.tsx", F.baseServer((request) => request.method === "POST" && request.path === "/auth/org/memberships/m-a/refunds"
    ? { status: 422, json: { detail: { code: "REFUND_EXCEEDS_ADVANCE", message: SAID, refundable: 0 } } } : null), { width: 375, height: 800 });
  await run.page.evaluate(() => window.mount("refund", { role: "owner", org_role: "owner" }, { moneyAvailable: true, groupName: "Алгебра 7 класс, углублённая программа подготовки к олимпиаде (вторник и пятница, 16:00)" }));
  await run.page.getByRole("radio", { name: "Наличные" }).click();
  await run.page.fill("#refund-reason", "Ученик ушёл");
  const submit = run.page.locator('[role="dialog"] button[type="submit"]');
  await submit.click();
  await run.page.waitForSelector('[role="dialog"] [role="status"], [role="dialog"] [role="alert"]');
  const dialog = plain(await run.page.textContent('[role="dialog"]'));
  assert.equal(dialog.split(plain(SAID)).length - 1, 1, dialog);
  assert.ok(!/Возвращать нечего/.test(dialog), "no own sentence next to the server's");
  assert.equal(await submit.isDisabled(), true, "nothing to give back here: the button is off");
  assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await run.page.close();
});
