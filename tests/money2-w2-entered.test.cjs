// Money-2 wave 2, Э9 (Т17): a payment entered later than its own day carries «внесено ДД.ММ» in the statement; an ordinary one - nothing.  (Refunds, write-offs and the journal: the statement row / the journal
// row carry no record day yet - see the report.)
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, OWNER } = require("./helpers/money2-w2.cjs");

const ctx = setup(test);
const list = () => F.paymentsList().map((payment) => (payment.id === "p2" ? { ...payment, paid_on: "2026-11-22", created_at: "2026-11-25T07:00:00" } : { ...payment, created_at: `${payment.paid_on}T07:00:00` }));
const server = F.baseServer((request) => (request.path === "/auth/org/memberships/m-a/statement" ? { json: F.statementWithVoided(F.SHORT) } : request.path === "/auth/org/memberships/m-a/payments" ? { json: list() } : null), F.SHORT);

test("Э9: «внесено 25.11» under the payment of 22.11 that was entered on 25.11; nothing under an ordinary payment", async () => {
  const run = await mount(ctx, server, "statement", OWNER, { moneyAvailable: true });
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.waitForSelector('[data-testid="entered-later"]');
  const marks = (await run.page.locator('[data-testid="entered-later"]').allTextContents()).map(plain);
  assert.deepEqual(marks, ["внесено 25.11"]);
  await run.page.close();
});

test("Э9 (Т16): the settings show «Общий месяц» FIRST with «рекомендуем»; the dictionary of the server's names keeps its order", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const page = fs.readFileSync(path.join(__dirname, "..", "src/app/owner/settings/page.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(__dirname, "..", "src/lib/payf-settings.ts"), "utf8");
  assert.match(settings, /PAYMENT_MODEL_ORDER[^=]*= \["fixed_day", "payment_date", "lessons"\]/);
  assert.match(settings, /RECOMMENDED_LABEL = "рекомендуем"/);
  assert.equal((page.match(/PAYMENT_MODELS\.map/g) ?? []).length, 0, "the screen draws the reordered list only");
  assert.equal((page.match(/shownModels\.map/g) ?? []).length, 2);
  assert.match(page, /option\.key === RECOMMENDED_MODEL/);
});
