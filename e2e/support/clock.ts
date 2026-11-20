/**
 * TIME-TESTS: the controllable business clock of the stand, seen from the tests.
 *
 *   serverNow()       the business time of the stand AS THE SERVICE SEES IT (GET /auth/dev/clock) - no `Date` header, no pause for its cache
 *   clockReaches(m)   wait until the stand shows `m` minutes since midnight (the clock keeps running: the stand moves with the real time)
 *   travel            move the clock (forward only): PUT on auth, poll EVERY service until it shows the same offset, then the clock of every open page
 *   registerContext   the shared fixture (support/fixtures.ts) gives every browser context the stand's time BEFORE the first `goto` and registers it here
 *
 * The browser clock is `context.clock` (Playwright), set to the stand time at the start and moved by `travel`; a test never patches `Date.now` by hand.
 * Move the clock only when the test has no request in flight: `travel` waits for the open pages to go idle, but it cannot hold back a request the test itself fires.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { AUTH_API, EXAM_API } from "./env";
import { businessNow, clockOffsetSeconds, standNow, type BusinessNow } from "./time";

const WITH_EXAM = process.env.E2E_EXAM === "1";

type ClockBody = { now_business: string; now_utc: string; offset_seconds: number };

async function readClock(url: string): Promise<ClockBody> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} - the stand clock is not available (run the suite through e2e/scripts/run.mjs: ALGO_TEST_CLOCK=1)`);
  return (await res.json()) as ClockBody;
}

/** The auth-service's clock (the one that is written; exam reads the same key). */
export const readAuthClock = () => readClock(`${AUTH_API}/auth/dev/clock`);
export const readExamClock = () => readClock(`${EXAM_API}/dev/clock`);

/** «YYYY-MM-DDTHH:MM[:SS]» of the service (the wall time of Tashkent) as a BusinessNow, without any time-zone arithmetic. */
export function parseBusinessIso(iso: string): BusinessNow {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) throw new Error(`unexpected business time from the stand: ${iso}`);
  // the same wall time, described through the one function that knows the zone: Tashkent is UTC+5 all year, so the moment is wall - 5 h
  const moment = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) - 5, Number(m[5])));
  return businessNow(moment);
}

/** The business time of the stand, from the service itself. */
export async function serverNow(): Promise<BusinessNow> {
  return parseBusinessIso((await readAuthClock()).now_business);
}

/** Wait until the stand shows at least `minutes` since midnight (business time) - at most `maxSeconds` (70 by default). */
export async function clockReaches(minutes: number, maxSeconds = 70): Promise<void> {
  for (let i = 0; i < maxSeconds * 4; i++) {
    if ((await serverNow()).minutes >= minutes && businessNow().minutes >= minutes) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the stand clock did not reach ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
}

// ------------------------------------------------------------------------------------------------ browser contexts

const openContexts = new Set<BrowserContext>();

/** The stand's time in the browser BEFORE the first `goto`: the clock runs on (`install` without a pause), starting from the stand's «now». */
export async function installBrowserClock(context: BrowserContext): Promise<void> {
  await context.clock.install({ time: standNow() });
  openContexts.add(context);
  context.once("close", () => openContexts.delete(context));
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined); // best effort: a page that never idles is moved anyway
}

// ------------------------------------------------------------------------------------------------ travel

const two = (n: number) => String(n).padStart(2, "0");
const isoOf = (now: BusinessNow) => `${now.date}T${two(now.hour)}:${two(now.minute)}`;

async function moveTo(target: string): Promise<void> {
  const before = await readAuthClock();
  if (target < before.now_business.slice(0, 16)) {
    throw new Error(`the stand clock only moves forward: now ${before.now_business.slice(0, 16)}, asked for ${target} (a fresh stand is the only way back)`);
  }
  await Promise.all([...openContexts].flatMap((context) => context.pages().map(settle)));
  const oldNowMs = standNow().getTime();
  const res = await fetch(`${AUTH_API}/auth/dev/clock`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ business_now: target }),
  });
  const body = (await res.json().catch(() => null)) as ClockBody | { detail?: unknown } | null;
  if (!res.ok || !body || !("offset_seconds" in body)) {
    throw new Error(`PUT /auth/dev/clock ${target}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  const offset = body.offset_seconds;
  // every service must see the new offset before the test goes on (exam keeps it in its own 0.2 s cache)
  for (let i = 0; ; i++) {
    const seen = [(await readAuthClock()).offset_seconds, ...(WITH_EXAM ? [(await readExamClock()).offset_seconds] : [])];
    if (seen.every((value) => value === offset)) break;
    if (i > 60) throw new Error(`the services did not take the clock offset ${offset}: ${JSON.stringify(seen)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  process.env.E2E_CLOCK_OFFSET_SECONDS = String(offset);
  const deltaMs = standNow().getTime() - oldNowMs;
  // the pages: the same jump (the due timers fire once, as after a long sleep of the tab)
  await Promise.all([...openContexts].map((context) => context.clock.fastForward(deltaMs)));
}

export const travel = {
  /** The absolute business date and time (forward only). */
  async toDate(date: string, time = "10:00"): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`travel.toDate wants YYYY-MM-DD and HH:MM, got ${date} ${time}`);
    await moveTo(`${date}T${time}`);
  },
  /** The next calendar day of the stand at `time`. */
  async toNextDay(time = "10:00"): Promise<void> {
    const today = (await serverNow()).date;
    const [y, m, d] = today.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    await moveTo(`${next.toISOString().slice(0, 10)}T${time}`);
  },
  /** The same day, later (forward only). */
  async toTime(time: string): Promise<void> {
    await moveTo(`${(await serverNow()).date}T${time}`);
  },
};

export { clockOffsetSeconds, isoOf };
