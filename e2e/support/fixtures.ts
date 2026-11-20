import { test as base, expect, type Page } from "@playwright/test";
import type { Session } from "./api";
import { installBrowserClock } from "./clock";

type Fixtures = {
  /**
   * Open a NEW browser context signed in as `session` (cookies of the API login) with the project's viewport /
   * touch settings and return its first page. Closed after the test. Use it for each person of a scenario
   * (owner, teacher, student), so they do not share cookies.
   */
  signIn: (session: Session) => Promise<Page>;
  /** A page that is not signed in (a student with a code, the login page). */
  anonymous: () => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  // TIME-TESTS: every browser context lives on the stand's business time from its first page on (the clock keeps running; `travel` moves it)
  context: async ({ context }, use) => {
    await installBrowserClock(context);
    await use(context);
  },
  signIn: async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (session) => {
      const context = await browser.newContext({
        baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId,
      });
      await installBrowserClock(context);
      await context.addCookies(session.cookies);
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
  anonymous: async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async () => {
      const context = await browser.newContext({
        baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId,
      });
      await installBrowserClock(context);
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };
