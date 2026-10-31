"use client";

import { create } from "zustand";

/** The «Поддержка» window is opened from two places (the profile menu of the left rail, «Ещё» of the phone) and drawn once by the sidebar. */
export const useSupportDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
