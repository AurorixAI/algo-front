import { NextResponse } from "next/server";

// Release data is injected at container start. It must never be cached by a
// route handler or CDN: an operator uses this endpoint to verify a deployment.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      service: "frontend",
      app_version: "1.0.0",
      release_sha: process.env.RELEASE_SHA || "unknown",
      release_ref: process.env.RELEASE_REF || "unknown",
      released_at: process.env.RELEASED_AT || "unknown",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
