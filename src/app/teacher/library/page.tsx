"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { BookOpen } from "lucide-react";

export default function TeacherLibraryPage() {
  return (
    <ComingSoon
      title="Библиотека"
      description="Банк заданий — находите готовые задачи или создавайте свои для экзаменов."
      icon={BookOpen}
      color="amber"
      features={[
        "Поиск заданий по теме и сложности",
        "Предпросмотр задачи с решением",
        "Создание собственных заданий",
        "Добавление в избранное",
        "Фильтр по учебнику и параграфу",
      ]}
    />
  );
}
