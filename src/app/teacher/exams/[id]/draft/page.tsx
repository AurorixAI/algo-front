"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function ExamDraftPage() {
  return (
    <ComingSoon
      title="Экзамены в разработке"
      description="Панель просмотра и редактирования вариантов контрольных работ будет доступна в следующем обновлении."
      icon={FileText}
      color="primary"
    />
  );
}
