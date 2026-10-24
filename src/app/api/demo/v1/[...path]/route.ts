import { NextRequest, NextResponse } from "next/server";

/**
 * The demo API exists ONLY in a demo build (NEXT_PUBLIC_DEMO_MODE=true). On a real deployment every method answers
 * 404 before anything is loaded: no demo login, no cookie, no state written to disk. The demo handlers are
 * imported lazily so that the real path never even evaluates them.
 */
async function handle(req: NextRequest, pathSegments: string[]) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return NextResponse.json({ detail: "Not Found" }, { status: 404 });
  }
  const { dispatchDemoRequestAsync, parseCookies } = await import("@demo/handlers");
  const path = "/" + pathSegments.join("/");
  let body: unknown = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await req.json();
    } catch {
      body = undefined;
    }
  }

  const result = await dispatchDemoRequestAsync({
    method: req.method,
    path,
    searchParams: req.nextUrl.searchParams,
    body,
    cookies: parseCookies(req.headers.get("cookie")),
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      if (k.toLowerCase() === "set-cookie") {
        // Multiple cookies in one header value (comma-separated, not comma in expires)
        for (const part of v.split(/,(?=\s*[\w-]+=)/)) {
          headers.append("Set-Cookie", part.trim());
        }
      } else {
        headers.set(k, v);
      }
    }
  }

  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return handle(req, params.path);
}
