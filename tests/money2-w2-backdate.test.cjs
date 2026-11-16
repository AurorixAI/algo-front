// Money-2 wave 2, Э9 (Т17): the refusal 403 `BACKDATE_OWNER_ONLY` («Запись старше 7 дней меняет владелец») is shown in the SERVER's words in the window of a cancel (the dry run too): no «Повторить», the button is off
// and says why.
const assert = require("node:assert/strict");
const test = require("node:test");
const { setup, plain, mount, F, ADMIN } = require("./helpers/money2-w2.cjs");

const ctx = setup(test);
const REFUSAL = "Запись старше 7 дней меняет владелец";
const server = F.baseServer((request) => {
  if (request.path === "/auth/org/memberships/m-a/statement") return { json: F.statementWithVoided(F.SHORT) };
  if (request.path === "/auth/org/memberships/m-a/payments") return { json: F.paymentsList() };
  if (request.method === "POST" && /\/payments\/p2\/void$/.test(request.path)) return { status: 403, json: { detail: { code: "BACKDATE_OWNER_ONLY", message: REFUSAL } } };
  return null;
}, F.SHORT);

test("Э9: the cancel of an old payment by an administrator - the refusal of the server, in its words, without «Повторить»; the button is off", async () => {
  const run = await mount(ctx, server, "statement", ADMIN, { moneyAvailable: true });
  await run.page.waitForSelector('[data-testid="statement-months"]');
  await run.page.getByRole("button", { name: /Действия|Ещё|Меню/ }).first().click();
  await run.page.getByRole("menuitem", { name: "Отменить оплату" }).click();
  await run.page.waitForSelector('[data-testid="money-effects"][data-state="failed"]');
  const dialog = plain(await run.page.locator('[role="dialog"]').evaluate((el) => el.innerText));
  // the block of the effects and the line over the off button (rule 3: an off button says why) - the same words of the server
  assert.equal((dialog.match(new RegExp(REFUSAL, "g")) ?? []).length, 2, dialog);
  assert.equal(await run.page.locator('[data-testid="money-effects-retry"]').count(), 0);
  assert.equal(await run.page.locator('[role="dialog"] button[type="submit"]').isDisabled(), true);
  await run.page.close();
});

test("Э9: the correction of a payment shares the same refusal path (the dry run of the replace -> `refusedInWords`)", () => {
  const fs = require("node:fs");
  const read = (file) => fs.readFileSync(require("node:path").join(__dirname, "..", file), "utf8");
  assert.match(read("src/lib/use-replace-effects.ts"), /refusedInWords\(preview\.error\)/);
  assert.match(read("src/lib/money-preview.ts"), /BACKDATE_OWNER_ONLY/);
});
