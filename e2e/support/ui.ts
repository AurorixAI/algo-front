import { expect, type Locator, type Page } from "@playwright/test";

/** "450000" -> `450\s000`: the UI groups thousands with a (non-breaking) space, which only `\s` matches in a RegExp. */
export function moneyPattern(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s");
}

/** "450000" -> /450\s000/ */
export function money(amount: number): RegExp {
  return new RegExp(moneyPattern(amount));
}

/** Text of a thousands-grouped number as the UI types it into an input ("450 000", any kind of space). */
export function groupedDigits(amount: number): string {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "2026-10-31" -> "31.10" */
export const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
/** "2026-10-31" -> "31.10.2026" */
export const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** The page must never scroll sideways (a regression class on 375px phones). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "horizontal overflow of the page, px").toBeLessThanOrEqual(1);
}

/** The box of an element once it stopped moving (a floating panel fades / slides in for a moment after it is shown). */
export async function settledBox(locator: Locator, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  let previous = await locator.boundingBox();
  for (;;) {
    await locator.page().waitForTimeout(120);
    const current = await locator.boundingBox();
    if (previous && current && ["x", "y", "width", "height"].every((k) => Math.abs((previous as any)[k] - (current as any)[k]) < 0.5)) return current;
    if (Date.now() > end) return current;
    previous = current;
  }
}

/** The element lies completely inside the viewport horizontally. */
export async function expectWithinViewportWidth(page: Page, locator: Locator) {
  const box = await settledBox(locator);
  const vw = page.viewportSize()!.width;
  expect(box, "element has a box").not.toBeNull();
  expect(box!.x, "left edge").toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width, "right edge").toBeLessThanOrEqual(vw + 0.5);
}

/** The element lies completely inside the viewport, vertically too (a floating panel must not need a scroll). */
export async function expectWithinViewport(page: Page, locator: Locator) {
  await expectWithinViewportWidth(page, locator);
  const box = await settledBox(locator);
  const vh = page.viewportSize()!.height;
  expect(box!.y, "top edge").toBeGreaterThanOrEqual(-0.5);
  expect(box!.y + box!.height, "bottom edge").toBeLessThanOrEqual(vh + 0.5);
}

/** A confirmation toast (role=status) with this text. */
export function toast(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text });
}

/**
 * The «⋯» menu of a group block on the «Оплаты» tab of the student card (UX-1 A): the rare actions live there -
 * «Назначить индивидуальную цену», «Вернуть цену группы», «Отменить запланированную…», «История цены», «История оплат».
 */
export async function openPaymentCardMenu(page: Page) {
  await page.getByRole("button", { name: /^Действия по оплате:/ }).first().click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Open the card's «⋯» menu and choose an item (its dialog / panel opens). */
export async function cardMenuItem(page: Page, name: string | RegExp) {
  await openPaymentCardMenu(page);
  await page.getByRole("menuitem", { name, exact: typeof name === "string" }).click();
}

/** The labels of the card's «⋯» menu (it is closed again). */
export async function cardMenuLabels(page: Page): Promise<string[]> {
  await openPaymentCardMenu(page);
  const labels = (await page.getByRole("menuitem").allTextContents()).map((text) => text.trim());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  return labels;
}
