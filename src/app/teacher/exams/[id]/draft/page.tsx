"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function ExamDraftPage() {
  return (
    <ComingSoon
      title="Экзамены"
      description="Панель просмотра и редактирования вариантов контрольных работ откроется после завершения этапов подключения центра."
      icon={FileText}
      color="primary"
    />
  );
}
