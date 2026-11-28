// The window of 300 ms of the probe «what adding these students charges» (`usePayFromPreview`, src/lib/use-pay-from.ts): the REAL hook with the REAL ask of the drawer (`orgApi.dryRunBulkAdd`).
// The choices are changed by the test (`window.choose([...ids])`), the time is moved by the test: no click, no list, nothing that waits for a frame.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { orgApi } from "@/lib/api";
import { usePayFromPreview } from "@/lib/use-pay-from";

const w = window as any;

function Probe() {
  const [ids, setIds] = React.useState<string[]>([]);
  w.choose = (next: string[]) => flushSync(() => setIds(next));   // the render and its effects are done when the call returns
  const key = ids.length > 0 ? `g2|${ids.join(",")}||null` : null;
  const preview = usePayFromPreview(key, (signal) => orgApi.dryRunBulkAdd("g2", ids, {}, signal));
  return <p data-testid="probe" data-status={preview.status}>{ids.join(",")}={preview.status}</p>;
}

let root: Root | null = null;
w.mount = () => { root = createRoot(document.getElementById("root")!); flushSync(() => root!.render(<Probe />)); };
