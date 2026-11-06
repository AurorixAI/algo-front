"use client";

import { useEffect, useRef, useState } from "react";
import { orgApi } from "./api";
import { normalizeBulkImmediate, normalizePayFromDefault, type BulkImmediate, type PayFromDefault } from "./pay-from";
import { createRequestSequence } from "./request-sequence";

/** «Оплата с» by default for a group: asked when the window opens; a failure leaves the field out (nothing is invented). */
export function usePayFromDefault(groupId: string, enabled: boolean): { def: PayFromDefault | null; loading: boolean } {
  const [state, setState] = useState<{ def: PayFromDefault | null; loading: boolean }>({ def: null, loading: false });
  useEffect(() => {
    if (!enabled || !groupId) { setState({ def: null, loading: false }); return undefined; }
    const controller = new AbortController();
    setState({ def: null, loading: true });
    orgApi.getPayFromDefault(groupId, controller.signal)
      .then((answer) => { if (!controller.signal.aborted) setState({ def: normalizePayFromDefault(answer), loading: false }); })
      .catch(() => { if (!controller.signal.aborted) setState({ def: null, loading: false }); });
    return () => controller.abort();
  }, [groupId, enabled]);
  return state;
}

export type PayFromPreview = { status: "idle" } | { status: "loading" } | { status: "ready"; immediate: BulkImmediate } | { status: "failed" };

/**
 * What adding ONE student from a past day would charge at once (the dry run of the add; `billing.immediate.text`, the money right only).  Asked once the person stops changing the day;
 * `key` is null while there is nothing to ask (no past day, several students, no money right).
 */
export function usePayFromPreview(key: string | null, load: (signal: AbortSignal) => Promise<unknown>): PayFromPreview {
  const [state, setState] = useState<PayFromPreview>({ status: "idle" });
  const sequence = useRef(createRequestSequence());
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    const token = sequence.current.next();
    if (key === null) { setState({ status: "idle" }); return undefined; }
    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loader.current(controller.signal)
        .then((answer) => { if (sequence.current.isCurrent(token)) setState({ status: "ready", immediate: normalizeBulkImmediate(answer) }); })
        .catch(() => { if (sequence.current.isCurrent(token) && !controller.signal.aborted) setState({ status: "failed" }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); sequence.current.next(); };
  }, [key]);
  return state;
}
