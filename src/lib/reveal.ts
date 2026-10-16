/**
 * When is a hover / focus / tap explanation shown?  The shared state machine of <Hint> and <FeatureLock>
 * (a mouse shows it on hover, the keyboard on focus, a touch screen on tap), pure so node:test covers it
 * (tests/n13-ui-floating.test.cjs).
 *
 * Touch rules: the hover a phone emulates after a tap is ignored, and so is the focus the press itself causes
 * (the click decides): the first tap opens it, the next tap closes it; leaving the element (blur) or a press
 * elsewhere (`dismiss`) clears it.
 */

export type RevealPointer = "mouse" | "touch" | "pen";

export interface RevealState {
  hovered: boolean;
  focused: boolean;
  /** Opened by a click / tap / Enter / Space and kept open until closed again. */
  pinned: boolean;
  /** The last pointer that touched the element. */
  pointer: RevealPointer;
  /** A pointer press is in progress (between pointerdown and click). */
  pressing: boolean;
}

export type RevealEvent =
  | { type: "pointer-enter"; pointerType: string }
  | { type: "pointer-down"; pointerType: string }
  | { type: "pointer-cancel" }
  | { type: "mouse-enter" }
  | { type: "mouse-leave" }
  | { type: "focus" }
  | { type: "blur" }
  /** `mousePins`: a mouse click pins it open too (a hint); a feature lock only reacts to a tap. */
  | { type: "click"; mousePins: boolean }
  /** Enter / Space on the focused element. */
  | { type: "key-toggle" }
  /** Escape, a press elsewhere, the trigger scrolled away. */
  | { type: "dismiss" };

export const INITIAL_REVEAL: RevealState = { hovered: false, focused: false, pinned: false, pointer: "mouse", pressing: false };

export const isRevealed = (state: RevealState): boolean => state.hovered || state.focused || state.pinned;

const pointerOf = (pointerType: string): RevealPointer => (pointerType === "touch" || pointerType === "pen" ? pointerType : "mouse");

export function reduceReveal(state: RevealState, event: RevealEvent): RevealState {
  switch (event.type) {
    case "pointer-enter":
      return { ...state, pointer: pointerOf(event.pointerType) };
    case "pointer-down":
      return { ...state, pointer: pointerOf(event.pointerType), pressing: true };
    case "pointer-cancel":
      return { ...state, pressing: false };
    case "mouse-enter":
      return state.pointer === "mouse" ? { ...state, hovered: true } : state;
    case "mouse-leave":
      return { ...state, hovered: false };
    case "focus":
      return state.pressing && state.pointer !== "mouse" ? state : { ...state, focused: true };
    case "blur":
      return { ...state, pressing: false, focused: false, pinned: false };
    case "click": {
      const base = { ...state, pressing: false };
      if (state.pointer === "mouse") return event.mousePins ? { ...base, pinned: !state.pinned } : base;
      return isRevealed(state)
        ? { ...base, hovered: false, focused: false, pinned: false }
        : { ...base, pinned: true };
    }
    case "key-toggle":
      return { ...state, pinned: !state.pinned };
    case "dismiss":
      return { ...state, hovered: false, focused: false, pinned: false, pressing: false };
  }
}
