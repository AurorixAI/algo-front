import { NextRequest, NextResponse } from "next/server";
import { allowedImageContentType, buildFigureTargetUrl } from "@/lib/figure-path";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 5000;

// Unauthenticated proxy: only `/api/v1/figures/<uuid>/<image file>` may reach the content service.
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const backendUrl =
    process.env.CONTENT_API_URL ||
    process.env.NEXT_PUBLIC_CONTENT_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://algo-content:8004"
      : "http://localhost:8004");

  const targetUrl = buildFigureTargetUrl(backendUrl, params.path);
  if (!targetUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        accept: request.headers.get("accept") || "image/*",
      },
      cache: "force-cache",
      signal: controller.signal,
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status, statusText: res.statusText });
    }

    const contentType = allowedImageContentType(res.headers.get("content-type"));
    if (!contentType) {
      console.error(`[figures proxy] non-image content-type from upstream for ${new URL(targetUrl).pathname}`);
      return new NextResponse("Figure proxy error", { status: 502 });
    }
    const cacheControl = res.headers.get("cache-control") || "public, max-age=31536000, immutable";
    const blob = await res.arrayBuffer();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error(`[figures proxy error] Failed to fetch figure ${new URL(targetUrl).pathname}:`, error);
    return new NextResponse("Figure proxy error", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
