// R3 M1: a window inside a form.  The `submit` of a React portal climbs the React tree: the dialog «Переоткрыть месяц» inside the form of the pause must not send the pause.
import React from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "@/components/ui/modal";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { useAuthStore } from "@/lib/store";
import { addIsoDays, formatBusinessDate } from "@/lib/business-time";

const w = window as any;
w.__log = [] as string[];
w.__helpers = { today: () => formatBusinessDate(), plus: (days: number) => addIsoDays(formatBusinessDate(), days) };
useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "owner", org_role: "owner" } as never, isAuthenticated: true });

function Nested() {
  return (
    <form id="outer" onSubmit={(event) => { event.preventDefault(); w.__log.push("OUTER submit"); }}>
      <label htmlFor="outer-field">Внешнее поле</label>
      <input id="outer-field" defaultValue="x" />
      <Modal open title="Вложенное окно" onClose={() => {}} footer={<button type="submit" form="inner" id="inner-submit">Да</button>}>
        <form id="inner" onSubmit={(event) => { event.preventDefault(); w.__log.push("inner submit"); }}>
          <input aria-label="Причина" defaultValue="причина" />
        </form>
      </Modal>
    </form>
  );
}

w.mount = (name: string) => {
  const root = createRoot(document.getElementById("root")!);
  if (name === "nested") root.render(<Nested />);
  if (name === "pause") root.render(<PauseDialog open membershipId="m1" studentName="Иванов Иван" groupName="7-А" onClose={() => {}} onChanged={() => {}} />);
};
