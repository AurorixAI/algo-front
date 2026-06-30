import type { DemoRequest, DemoResponse } from "../types";
import { initDemoState, demoState } from "../engine/state";
import { syncDemoStateFromStore, persistDemoState } from "../engine/persist";
import { handleAuth } from "./auth";
import { handleDiagnostic, handleAnalytics } from "./diagnostic";
import { handleTextbook } from "./textbook";
import { handleExam } from "./exam";

export function dispatchDemoRequest(req: DemoRequest): DemoResponse {
  initDemoState();

  const handlers = [handleAuth, handleTextbook, handleExam, handleDiagnostic, handleAnalytics];

  for (const handler of handlers) {
    const res = handler(req);
    if (res) return res;
  }

  return { status: 404, body: { detail: `Demo endpoint not found: ${req.method} ${req.path}` } };
}

export async function dispatchDemoRequestAsync(req: DemoRequest): Promise<DemoResponse> {
  initDemoState();
  await syncDemoStateFromStore(demoState);
  const res = dispatchDemoRequest(req);

  const isMutation = req.method !== "GET" && req.method !== "HEAD";
  if (isMutation && res.status < 400) {
    await persistDemoState(demoState);
  }

  return res;
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
}
