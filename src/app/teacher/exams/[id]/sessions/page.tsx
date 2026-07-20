"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { FileText } from "lucide-react";

export default function ExamSessionsPage() {
  return (
    <ComingSoon
      title="Экзамены"
      description="Результаты прохождения контрольных работ учениками откроются после завершения этапов подключения центра."
      icon={FileText}
      color="primary"
    />
  );
}
