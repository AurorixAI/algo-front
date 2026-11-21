#!/usr/bin/env node
/**
 * Control of the phone stand without a window (Playwright WebKit, iPhone 390x844):  node e2e/scripts/phone-demo-shots.mjs <out-dir>
 * 1. the helper page: the button «Войти как владелец» -> the link «Оплаты (владелец)» -> the screen is open under the owner (the cookies come from the form);
 * 2. screenshots of «Оплаты»: Должники, К оплате, Без долга, and one statement (the first debtor).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { devices, webkit } from "@playwright/test";

const out = path.resolve(process.argv[2] || "phone-demo-shots");
mkdirSync(out, { recursive: true });
const PHONE = process.env.E2E_PHONE_PORT || 13200;
const FRONT = `http://localhost:${process.env.E2E_FRONT_PORT || 13000}`;

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
const page = await context.newPage();
let ok = true;
const check = (what, good) => {
  console.log(`${good ? "OK  " : "FAIL"} ${what}`);
  ok = ok && good;
};

await page.goto(`http://localhost:${PHONE}/`);
await page.getByTestId("login-owner").click();
await page.waitForLoadState("load");
const answer = (await page.locator("body").innerText()).slice(0, 80).replace(/"[^"]{20,}"/g, '"…"');
console.log(`form answer: ${answer}`);
await page.goto(`http://localhost:${PHONE}/`);
await page.getByRole("link", { name: /Оплаты \(владелец\)/ }).click();
await page.waitForURL(/\/owner\/payments/);
await page.getByRole("heading", { name: "Оплаты" }).first().waitFor({ timeout: 20000 });
check("owner payments page opened after the form sign-in", /\/owner\/payments/.test(page.url()) && !/login/.test(page.url()));

for (const [bucket, file] of [["debtors", "01-debtors"], ["to_pay", "02-to-pay"], ["active", "03-no-debt"]]) {
  await page.goto(`${FRONT}/owner/payments?bucket=${bucket}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, `${file}.png`), fullPage: true });
  console.log(`shot ${file}.png  tab: ${await page.getByRole("tab", { selected: true }).first().innerText().catch(() => "?")}`);
}
await page.goto(`${FRONT}/owner/payments?bucket=debtors`);
await page.waitForLoadState("networkidle");
const link = page.locator('a[href*="/owner/payments/statement/"]').first();
if (await link.count()) {
  await link.click();
  await page.waitForURL(/statement/);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "04-statement.png"), fullPage: true });
  console.log(`shot 04-statement.png ${page.url().replace(/[0-9a-f-]{36}/, "<id>")}`);
} else {
  console.log("no statement link found on the debtors tab");
}
await browser.close();
process.exit(ok ? 0 : 1);
