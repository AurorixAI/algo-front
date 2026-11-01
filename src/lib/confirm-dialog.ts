/**
 * WB-P5 (F-A20): the platform's own «are you sure?» - a promise-returning question that replaces the browser's `confirm()`
 * (a native box is blocked in iOS home-screen apps and in in-app browsers, where it either never asks or silently
 * answers «no»).  `askConfirm()` can be called from anywhere (a click handler, the leave-page guard); the single
 * `<ConfirmHost/>` mounted in the root layout draws the question in the platform's modal style.
 * Pure (no React, no window), so node:test drives it.  Questions asked while another is open wait their turn.
 */

export interface ConfirmRequest {
  title: string;
  /** One or two sentences: what will happen. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (red button) for something that cannot be undone; default `primary`. */
  tone?: "primary" | "danger";
}

export interface PendingConfirm extends ConfirmRequest {
  id: number;
}

let nextId = 1;
const queue: Array<{ request: PendingConfirm; resolve: (answer: boolean) => void }> = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of Array.from(listeners)) listener();
}

/** Asks the question; resolves `true` on the confirming button, `false` on «Отмена», Escape, the cross or the backdrop. */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({ request: { ...request, id: nextId++ }, resolve });
    notify();
  });
}

/** The question on screen now (the oldest unanswered one), or null. */
export function currentConfirm(): PendingConfirm | null {
  return queue.length ? queue[0].request : null;
}

/** The host answers the question on screen. */
export function answerConfirm(answer: boolean): void {
  const entry = queue.shift();
  if (!entry) return;
  entry.resolve(answer);
  notify();
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
