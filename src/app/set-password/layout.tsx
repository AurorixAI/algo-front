import type { ReactNode } from "react";
import { NOINDEX } from "@/lib/noindex";

// Secret / one-time address: not for search engines (K3 P3).
export const metadata = NOINDEX;

export default function NoIndexLayout({ children }: { children: ReactNode }) {
  return children;
}
