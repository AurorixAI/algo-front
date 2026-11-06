import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** `twMerge` that knows the design tokens of tailwind.config.ts: `rounded-control` replaces `rounded-lg`, `shadow-card` replaces `shadow-md`, `min-h-control` replaces `min-h-10`, and so on. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["tag", "control", "card", "modal"] }],
      shadow: [{ shadow: ["card", "pop"] }],
      "font-size": [{ text: ["caption", "body", "section", "title", "page", "display"] }],
      h: [{ h: ["control", "control-sm", "control-lg", "control-touch"] }],
      w: [{ w: ["control", "control-sm", "control-touch"] }],
      "min-h": [{ "min-h": ["control", "control-sm", "control-lg", "control-touch", "control-sm-touch"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
