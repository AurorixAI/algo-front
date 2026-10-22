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

/**
 * The «Срок» of a waiting excuse in the words of the screen (UX-1 B), written from the rule and not from the app's helper:
 * «Остался 1 день» / «Осталось 25 дней» / «Срок сегодня» / «Срок прошёл 3 дня назад».
 */
export function deadlineWords(daysLeft: number): string {
  const noun = (n: number) => {
    const tail = n % 100;
    const last = n % 10;
    if (tail >= 11 && tail <= 14) return "дней";
    if (last === 1) return "день";
    if (last >= 2 && last <= 4) return "дня";
    return "дней";
  };
  if (daysLeft < 0) return `Срок прошёл ${-daysLeft} ${noun(-daysLeft)} назад`;
  if (daysLeft === 0) return "Срок сегодня";
  const verb = daysLeft % 10 === 1 && daysLeft % 100 !== 11 ? "Остался" : "Осталось";
  return `${verb} ${daysLeft} ${noun(daysLeft)}`;
}

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
 * The «⋯» menu of a group block on the «Оплаты» tab of the student card, and of a row of the group's «Оплаты» tab (IA audit 22.10: the same
 * component, at most three items): «Простить долг» | «Вернуть аванс», «Индивидуальная цена…», «Остаток на начало…».
 */
export async function openPaymentCardMenu(page: Page) {
  await page.getByRole("button", { name: /^Действия по оплате:/ }).first().click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Open the card's «⋯» menu and choose an item (its dialog / panel opens). */
export async function cardMenuItem(page: Page, name: string | RegExp) {
  // A scroll closes the menu by design (the page can still settle - the payments notice slides in above the card - and
  // a real click scrolls a menu clipped by a phone's viewport into view first): the click event is sent to the item itself,
  // and the menu is opened again when a late scroll closed it.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.getByRole("button", { name: /^Действия по оплате:/ }).first().click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2000 });
      await page.getByRole("menuitem", { name, exact: typeof name === "string" }).dispatchEvent("click", undefined, { timeout: 3000 });
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      await page.waitForTimeout(400);
    }
  }
}

/** The labels of the card's «⋯» menu (it is closed again). */
export async function cardMenuLabels(page: Page): Promise<string[]> {
  await openPaymentCardMenu(page);
  const labels = (await page.getByRole("menuitem").allTextContents()).map((text) => text.trim());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  return labels;
}

/**
 * «⋯» -> «Индивидуальная цена…» -> the window «Индивидуальная цена» -> one of its modes (the dialog of the mode opens over it):
 * `assign` «Назначить индивидуальную цену», `return` «Вернуть цену группы», `cancel` «Отменить запланированную…».  `scope` narrows the
 * menu button to one row (the group's «Оплаты» tab has one per student).
 */
export async function openPriceMode(page: Page, mode: "assign" | "return" | "cancel", scope?: Locator) {
  const root = scope ?? page;
  for (let attempt = 0; ; attempt++) {
    try {
      await root.getByRole("button", { name: /^Действия по оплате:/ }).first().click();
      await expect(page.getByRole("menu")).toBeVisible({ timeout: 2000 });
      await page.getByRole("menuitem", { name: "Индивидуальная цена…", exact: true }).dispatchEvent("click", undefined, { timeout: 3000 });
      const hub = page.getByRole("dialog", { name: "Индивидуальная цена", exact: true });
      await expect(hub).toBeVisible({ timeout: 3000 });
      await hub.getByTestId(`price-mode-${mode}`).first().click();
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
      await page.waitForTimeout(400);
    }
  }
}
