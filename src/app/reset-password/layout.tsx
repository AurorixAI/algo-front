import type { Metadata } from "next";

// The address of this page carries a one-time secret (#token=..., a fragment: never sent to any server). Nothing opened from here may be told
// where the visitor came from (the Referer of a link, a font, a script), and search engines have no
// business with it. next.config.js sends the same policy as a response header.
export const metadata: Metadata = {
  title: "Новый пароль - ALGO",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
