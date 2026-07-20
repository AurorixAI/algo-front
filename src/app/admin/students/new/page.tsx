"use client";

import { ComingSoon } from "@/components/ui/coming-soon";
import { Brain } from "lucide-react";

export default function NewStudentPage() {
  return (
    <ComingSoon
      title="Новая диагностика"
      description="Регистрация учеников и запуск диагностических тестов откроются после завершения этапов подключения центра."
      icon={Brain}
      color="primary"
      features={[
        "Быстрая регистрация учеников",
        "Адаптивное тестирование по темам",
        "Автоматический расчет уровня знаний θ",
        "QR-коды и ссылки для отправки в Telegram/WhatsApp",
      ]}
    />
  );
}
