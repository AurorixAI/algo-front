"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionSync } from "@/components/auth/SessionSync";
import { ConfirmHost } from "@/components/ui/confirm-host";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionSync />
      {children}
      <ConfirmHost />
    </QueryClientProvider>
  );
}
