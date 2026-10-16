import { test as base, expect, type Page } from "@playwright/test";
import type { Session } from "./api";

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
  signIn: async ({ browser, baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async (session) => {
      const context = await browser.newContext({
        baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale, timezoneId,
      });
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
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };
