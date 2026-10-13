/**
 * Pure rules of the two-step option selection (OptionGrid) and of the exam page's advance to the
 * next question - kept out of the components so they can be tested without a DOM.
 */

export interface OptionTapResult {
  /** the option that carries the pending check mark afterwards (null = none) */
  pending: string | null;
  /** this tap confirms the answer: the caller runs onSelect(tapped) exactly once */
  confirm: boolean;
}

/**
 * First tap on an option = pending check mark; second tap on the SAME option = confirm; a tap on another
 * option moves the mark. After a confirm the mark is cleared at once: a quick third tap starts a new
 * pending step instead of confirming again (the exam page used to advance twice and skip a question).
 */
export function resolveOptionTap(pending: string | null, tapped: string, disabled = false): OptionTapResult {
  if (disabled) return { pending, confirm: false };
  if (pending === tapped) return { pending: null, confirm: true };
  return { pending: tapped, confirm: false };
}

export interface AdvanceOnceDeps {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  delayMs: number;
  advance: () => void;
}

/**
 * "Go to the next question after a short pause", at most once per pause: while one advance is scheduled
 * every further request is ignored (a fast extra tap used to call goNext twice and skip a question).
 */
export function createAdvanceOnce(deps: AdvanceOnceDeps) {
  let handle: unknown = null;
  return {
    /** true when this call scheduled the advance, false when one is already pending */
    request(): boolean {
      if (handle !== null) return false;
      handle = deps.setTimeout(() => {
        handle = null;
        deps.advance();
      }, deps.delayMs);
      return true;
    },
    /** drop a pending advance (unmount, or the question changed by other means) */
    cancel() {
      if (handle !== null) {
        deps.clearTimeout(handle);
        handle = null;
      }
    },
  };
}
