"use client";

import { EmptyState, Panel } from "../../../components/bits";

export default function NoAccess() {
  return (
    <Panel>
      <EmptyState title="Нет доступных разделов" text="Вашей роли пока не открыт ни один раздел консоли. Обратитесь к владельцу платформы." />
    </Panel>
  );
}
