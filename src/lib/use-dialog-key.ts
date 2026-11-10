import { useRef } from "react";
import { newIdempotencyKey } from "./idempotency-key";

/**
 * The `Idempotency-Key` of a money window (Money-1 V1, LESSONS 85/104): made when the window opens (`resetKey` changes), lives until it closes and is sent with EVERY try - a retry after a lost answer
 * or a continue after `BALANCE_CHANGED` carries the same key, so the server cannot enter the money twice (a second `DUPLICATE_*` is a success).  A new opening is a new key.
 */
export function useDialogKey(resetKey: string | null): () => string {
  const key = useRef<string>(newIdempotencyKey());
  const last = useRef<string | null>(resetKey);
  if (last.current !== resetKey) { last.current = resetKey; key.current = newIdempotencyKey(); }
  return () => key.current;
}
