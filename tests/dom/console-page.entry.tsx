// PAY-TAILS Б11.22 п.12: the REAL page of the console «Сверка денег» - the frame of the panel (`PanelShell`: the sidebar from 1024, the bar of a phone) round the screen; the session and the data are the stub of the test.
import React from "react";
import { createRoot } from "react-dom/client";
import { PanelShell } from "../../console/src/components/shell";
import { MoneyReconcileScreen } from "../../console/src/components/money-reconcile";

const w = window as any;
const root = createRoot(document.getElementById("root")!);
w.showPage = () => root.render(<PanelShell><MoneyReconcileScreen /></PanelShell>);
