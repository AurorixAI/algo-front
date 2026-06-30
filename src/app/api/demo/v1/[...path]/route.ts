import { NextRequest, NextResponse } from "next/server";
import { dispatchDemoRequestAsync, parseCookies } from "@demo/handlers";

async function handle(req: NextRequest, pathSegments: string[]) {
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
