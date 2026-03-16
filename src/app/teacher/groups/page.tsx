"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { Users } from "lucide-react";

export default function TeacherGroupsPage() {
  return (
    <ComingSoon
      title="Мои группы"
      description="Управление вашими учебными группами — состав, расписание и общий прогресс."
      icon={Users}
      color="green"
      features={[
        "Список ваших групп с учениками",
        "Средний балл и динамика группы",
        "Массовый запуск диагностик",
        "Назначение экзаменов группе",
        "Быстрый переход к профилю ученика",
      ]}
    />
  );
}
