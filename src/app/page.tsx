import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeRedirect } from "@/components/auth/home-redirect";
import { authCookieValue } from "@/lib/auth-cookie";

/**
 * `/` has no page of its own: access to ALGO is by invitation and the public landing lives elsewhere.
 * No session cookie -> the sign-in.  A session cookie -> the signed-in user's own home (the role -> home table of
 * `lib/role-home.ts`), decided in the browser where the stored profile is.
 */
export default function Home() {
  const jar = cookies();
  if (!authCookieValue((name) => jar.get(name))) redirect("/login");
  return <HomeRedirect />;
}
