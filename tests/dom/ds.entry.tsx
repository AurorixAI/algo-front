// Design-system waves 0-1: a gallery of the shared controls and a few whole screens of the real project in the real browser (tests/dom/ds-shots.cjs).
// Only the API that exists before and after the waves is used here, so the same entry draws the «было» (88f9198) and the «стало».
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuthStore } from "@/lib/store";
import { GroupsListView } from "@/components/groups/groups-list-view";
import { PaymentsPage } from "@/components/payments/payments-page";
import { ConfirmFooter } from "@/components/money/dialog-footer";
import { ModalActions } from "@/components/ui/modal-actions";
import { TouchDensity } from "@/components/ui/touch-density";
import TeacherDashboard from "@/app/teacher/dashboard/page";
import TeacherSchedule from "@/app/teacher/schedule/page";
import TeacherExams from "@/app/teacher/exams/page";
import OwnerDashboard from "@/app/owner/dashboard/page";
import { TimeInput } from "@/components/ui/time-input";
import { AddLessonDialog } from "@/components/schedule/weekly-lesson-dialogs";
import { ExcusesPage } from "@/components/attendance/excuses-page";
import { LessonSlotFields, type SlotFormValue } from "@/components/schedule/lesson-slot-fields";

(window as any).__ready = true;
const w = window as any;

function Gallery() {
  const { showToast, toastNode } = useToast();
  const [open, setOpen] = React.useState<null | "question" | "form" | "why">(null);
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Кнопки, окна, тосты</h1>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Button>Внести 400 000 сум</Button>
          <Button variant="secondary">Экспорт</Button>
          <Button variant="ghost">Отмена</Button>
          <Button variant="danger">Отменить оплату</Button>
          <Button disabled>Недоступно</Button>
          <Button loading>Сохраняем</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Малая</Button>
          <Button size="md">Обычная</Button>
          <Button size="lg">Крупная</Button>
          <Button size="sm" variant="secondary">Малая</Button>
          <Button size="lg" variant="danger">Крупная</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="ok" pill>Оплачено</Chip>
          <Chip tone="warn" pill>Нужно решение</Chip>
          <Chip tone="danger" pill>Долг 400 000 сум</Chip>
          <Chip tone="info" pill>Запланирован</Chip>
          <Chip tone="neutral" pill>Месяц открыт</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <button id="open-question" onClick={() => setOpen("question")} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white">Окно-вопрос</button>
          <button id="open-form" onClick={() => setOpen("form")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Окно с формой</button>
          <button id="toast-ok" onClick={() => showToast("Оплата записана: 400 000 сум", "success")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Тост: успех</button>
          <button id="toast-warn" onClick={() => showToast("Месяц закрыт: ведомость не изменится", "warning")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Тост: внимание</button>
          <button id="open-why" onClick={() => setOpen("why")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Окно: кнопка выключена</button>
          <button id="toast-info" onClick={() => showToast("Выписка обновится в течение минуты", "info")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Тост: инфо</button>
          <button id="toast-link" onClick={() => showToast("Оплата записана: 400 000 сум", "success", undefined, { label: "Открыть выписку", href: "/owner/payments" })} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Тост: со ссылкой</button>
          <button id="toast-err" onClick={() => showToast("Не удалось сохранить. Повторите", "error")} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Тост: ошибка</button>
        </div>
      </section>
      <Modal open={open === "question"} onClose={() => setOpen(null)} title="Архивировать группу «7-А Алгебра»?" maxWidthClassName="max-w-md"
        footer={<ConfirmFooter primary="Архивировать" tone="danger" onPrimary={() => setOpen(null)} onCancel={() => setOpen(null)} />}>
        <p className="text-sm text-slate-600">Ученики останутся в системе, расписание группы закроется с сегодняшнего дня.</p>
      </Modal>
      <Modal open={open === "form"} onClose={() => setOpen(null)} title="Оплата от ученика" maxWidthClassName="max-w-[520px]"
        footer={<ConfirmFooter primary="Внести 400 000 сум" onPrimary={() => setOpen(null)} onCancel={() => setOpen(null)} />}>
        <label className="block text-sm font-semibold text-slate-700">Сумма
          <input className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" defaultValue="400 000" />
        </label>
      </Modal>
      <Modal open={open === "why"} onClose={() => setOpen(null)} title="Записать выплату" size="sm"
        footer={<ModalActions primary="Записать выплату 757 500 сум" disabled why="Укажите, как выплачено: наличные, карта или перевод." onPrimary={() => setOpen(null)} onCancel={() => setOpen(null)} />}>
        <p className="text-sm text-slate-600">Преподаватель: Каримова К.</p>
      </Modal>
      {toastNode}
    </div>
  );
}

function TimeDemo({ initial = "", inModal = true }: { initial?: string; inModal?: boolean }) {
  const [value, setValue] = React.useState(initial);
  const [slot, setSlot] = React.useState<SlotFormValue>({ startTime: "", endTime: "", format: "offline", room: "", topic: "", color: "blue" } as SlotFormValue);
  const [touched, setTouched] = React.useState(false);
  const body = (
    <div className="space-y-3 p-4">
      <label htmlFor="demo-time" className="block text-xs font-semibold text-slate-700">Время</label>
      <TimeInput id="demo-time" value={value} onChange={setValue} />
      <p data-testid="demo-value">{value}</p>
    </div>
  );
  return inModal ? (
    <>
      <Modal open title="Изменить занятие" onClose={() => (window as any).__log?.push("close")} footer={<ModalActions primary="Сохранить" onPrimary={() => setTouched(true)} onCancel={() => (window as any).__log?.push("cancel")} />}>
        <div className="space-y-3">
          <LessonSlotFields idPrefix="demo" value={slot} onChange={(patch) => setSlot((c) => ({ ...c, ...patch }))} showRequired={touched} />
          {body}
        </div>
      </Modal>
    </>
  ) : body;
}

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true, org: props.org ?? null } as never);
  const root = createRoot(document.getElementById("root")!);
  const page = (node: React.ReactNode) => root.render(<div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-[1400px]">{node}</div></div>);
  switch (name) {
    case "gallery": root.render(<Gallery />); break;
    case "excuses": page(<ExcusesPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />); break;
    case "timePicker": root.render(<TimeDemo initial={props.initial ?? ""} inModal={props.inModal !== false} />); break;
    case "addLesson": root.render(<AddLessonDialog open group={{ id: "g1", name: "7-А Алгебра" }} teacherAssigned role="manager" siblings={[]} onClose={() => {}} onAdded={() => {}} />); break;
    case "ownerDashboard": page(<OwnerDashboard />); break;
    case "groups": page(<GroupsListView workspace="owner" />); break;
    case "payments": page(<PaymentsPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />); break;
    case "teacherDashboard": page(<><TouchDensity /><TeacherDashboard /></>); break;
    case "teacherSchedule": page(<><TouchDensity /><TeacherSchedule /></>); break;
    case "teacherExams": page(<><TouchDensity /><TeacherExams /></>); break;
    default: break;
  }
};
