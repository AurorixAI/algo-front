// R3 m5: the REAL hooks that ask the server for what an action does to money (`useMoneyPreview`, `useFormMoneyPreview`, `useDebouncedValue`) in a real React, no stand-in.
// A probe draws the status the hook gives on EVERY render into `window.__renders`; `window.__loads` holds the asks the hook made (each can be answered, failed or seen aborted by the test).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useMoneyPreview, useFormMoneyPreview } from "@/lib/use-money-preview";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const w = window as any;
w.__renders = [] as string[];
w.__loads = [] as Array<{ key: string; signal: AbortSignal; resolve: (answer: unknown) => void; reject: (error: unknown) => void }>;
const load = (key: string | null) => (signal: AbortSignal) => new Promise((resolve, reject) => { w.__loads.push({ key, signal, resolve, reject }); });
const label = (preview: any) => (preview.status === "ready" ? `ready:${preview.answer?.for ?? "?"}` : preview.status);

function Probe({ kind, delayMs }: { kind: "plain" | "form"; delayMs: number }) {
  const [key, setKey] = useState<string | null>(null);
  w.setKey = setKey;
  const plain = useMoneyPreview(kind === "plain" ? key : null, load(key));
  const form = useFormMoneyPreview(kind === "form" ? key : null, load(key), delayMs);
  const state = kind === "plain" ? plain : form;
  w.retry = state.retry;
  const text = `${key ?? "-"}=${label(state.preview)}`;
  w.__renders.push(text);
  return <p id="state" data-status={state.preview.status}>{text}</p>;
}

function Debounced({ delayMs }: { delayMs: number }) {
  const [value, setValue] = useState("a");
  w.setValue = setValue;
  const settled = useDebouncedValue(value, delayMs);
  w.__renders.push(`${value}/${settled}`);
  return <p id="state">{value}/{settled}</p>;
}

w.mount = (name: string, props: any = {}) => {
  const root = createRoot(document.getElementById("root")!);
  w.unmount = () => root.unmount();
  if (name === "probe") root.render(<Probe kind={props.kind} delayMs={props.delayMs ?? 30} />);
  if (name === "debounced") root.render(<Debounced delayMs={props.delayMs ?? 30} />);
};
