import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path ? params.path.join("/") : "";
  const backendUrl =
    process.env.CONTENT_API_URL ||
    process.env.NEXT_PUBLIC_CONTENT_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "http://algo-content:8004"
      : "http://localhost:8004");

  const targetUrl = `${backendUrl}/api/v1/figures/${path}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        accept: request.headers.get("accept") || "image/*",
      },
      cache: "force-cache",
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status, statusText: res.statusText });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const cacheControl = res.headers.get("cache-control") || "public, max-age=31536000, immutable";
    const blob = await res.arrayBuffer();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error: any) {
    console.error(`[figures proxy error] Failed to fetch figure ${path} from ${targetUrl}:`, error);
    return new NextResponse("Figure proxy error", { status: 502 });
  }
}
