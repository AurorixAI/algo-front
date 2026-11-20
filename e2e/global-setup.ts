/**
 * TIME-TESTS: read the shift of the stand clock ONCE, before the workers start, into `process.env` (the workers inherit it);
 * `businessNow()` (support/time.ts) is synchronous and adds this shift to the clock of the computer, `travel` (support/clock.ts) updates it.
 * No stand clock (test_clock false / the routes do not exist) - the suite does not start: its dates would be the computer's, not the stand's.
 */
import { AUTH_ORIGIN, EXAM_API } from "./support/env";
import { readAuthClock, readExamClock } from "./support/clock";

export default async function globalSetup(): Promise<void> {
  const health = (await fetch(`${AUTH_ORIGIN}/health`).then((r) => r.json())) as { test_clock?: boolean };
  if (health.test_clock !== true) throw new Error("auth /health: test_clock is not true - the stand has no controllable clock (ALGO_TEST_CLOCK=1), the suite does not start");
  const auth = await readAuthClock();
  if (process.env.E2E_EXAM === "1") {
    const exam = await readExamClock();
    if (exam.offset_seconds !== auth.offset_seconds) throw new Error(`auth and exam show different clock offsets: ${auth.offset_seconds} / ${exam.offset_seconds} (${EXAM_API})`);
  }
  process.env.E2E_CLOCK_OFFSET_SECONDS = String(auth.offset_seconds);
  console.log(`[e2e] stand business time ${auth.now_business} (offset ${auth.offset_seconds} s)`);
}
