"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { LayoutDashboard } from "lucide-react";

export default function TeacherDashboardPage() {
  return (
    <ComingSoon
      title="Панель управления"
      description="Ваша персональная сводка — ученики, группы, ближайшие экзамены и результаты."
      icon={LayoutDashboard}
      color="primary"
      features={[
        "Сводка по вашим группам и ученикам",
        "Ближайшие экзамены и дедлайны",
        "Последние результаты диагностик",
        "Быстрые действия: создать экзамен, запустить диагностику",
        "Уведомления о завершённых тестах",
      ]}
    />
  );
}
