// R3 (unconfirmed 3): the open divergence of «Сверка денег» after «Обновить».
import React from "react";
import { createRoot } from "react-dom/client";
import { MoneyReconcileView } from "../../console/src/components/money-reconcile";

const w = window as any;
const root = createRoot(document.getElementById("root")!);
w.show = (data: unknown) => root.render(<MoneyReconcileView data={data as never} loading={false} refreshing={false} error={null} onReload={() => w.__reloads = (w.__reloads || 0) + 1} />);
