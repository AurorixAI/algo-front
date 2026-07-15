"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { Calendar } from "lucide-react";

export default function TeacherSchedulePage() {
  return (
    <ComingSoon
      title="Расписание занятий"
      description="Интерактивный календарь и планирование уроков находятся на стадии разработки."
      icon={Calendar}
      color="purple"
      features={[
        "Календарь на неделю и день",
        "Управление событиями и группами",
        "Детали уроков и посещаемость",
        "Интеграция с онлайн-классами (Zoom)",
      ]}
    />
  );
}
