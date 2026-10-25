import { redirect } from "next/navigation";
import { sourceQuery } from "@/lib/demo-request";

/**
 * Self-service registration is closed: access to ALGO is by invitation (the accounting server answers `/auth/apply` with 410).
 * An old link to /register lands on the demo request; the campaign tags of the link (utm_*, ref) travel with it.
 */
export default function RegisterPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  redirect(`/request-demo${sourceQuery(`?${params.toString()}`)}`);
}
