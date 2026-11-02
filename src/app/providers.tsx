"use client";

import { ReactNode } from "react";
import { SessionSync } from "@/components/auth/SessionSync";
import { ConfirmHost } from "@/components/ui/confirm-host";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionSync />
      {children}
      <ConfirmHost />
    </>
  );
}
