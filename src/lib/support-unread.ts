"use client";

import { create } from "zustand";
import { supportApi } from "./api";

/** The badge of «Мои обращения» asks at sign-in and every two minutes - a light query, not a stream. */
export const SUPPORT_UNREAD_POLL_MS = 120_000;

/** How many of MY tickets have an answer of the team that I have not opened yet (the server counts; the card opening is the look). */
export const useSupportUnread = create<{ count: number; load: () => Promise<void>; reset: () => void }>((set) => ({
  count: 0,
  load: async () => {
    try {
      const data = await supportApi.unread();
      if (data && typeof data.count === "number") set({ count: data.count });
    } catch {
      /* the badge is a hint: a failure keeps the last number */
    }
  },
  reset: () => set({ count: 0 }),
}));
