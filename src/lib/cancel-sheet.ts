/**
 * The draft of the lesson sheet (`components/groups/lesson-action-sheet.tsx`): which step is open, the reason typed and the kind chosen.  A reducer, so that the rules
 * («every step starts clean: no reason and no kind left from the last lesson») are one tested piece of code and not a line to remember in three places.
 */
import { DEFAULT_CANCELLATION_KIND, type CancellationKind } from "./payf";

export type SheetMode = "menu" | "reschedule" | "cancel" | "kind" | "restore";

export interface SheetDraft {
  mode: SheetMode;
  reason: string;
  kind: CancellationKind;
}

export type SheetAction =
  | { type: "open"; mode: SheetMode; kind?: CancellationKind }   // a step opens clean; «kind» starts from the kind the lesson has
  | { type: "close" }                                            // the sheet closes: everything is forgotten
  | { type: "mode"; mode: SheetMode }                            // «Назад» and the like: only the step changes
  | { type: "reason"; reason: string }
  | { type: "kind"; kind: CancellationKind }
  | { type: "reset" };                                           // after a save: reason and kind are forgotten, the step stays

export const FRESH_DRAFT: SheetDraft = { mode: "menu", reason: "", kind: DEFAULT_CANCELLATION_KIND };

export function sheetReducer(state: SheetDraft, action: SheetAction): SheetDraft {
  switch (action.type) {
    case "open": return { mode: action.mode, reason: "", kind: action.kind ?? DEFAULT_CANCELLATION_KIND };
    case "close": return FRESH_DRAFT;
    case "mode": return { ...state, mode: action.mode };
    case "reason": return { ...state, reason: action.reason };
    case "kind": return { ...state, kind: action.kind };
    case "reset": return { ...state, reason: "", kind: DEFAULT_CANCELLATION_KIND };
  }
}
