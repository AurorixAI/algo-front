"use client";

import { GroupPricesPage } from "@/components/payments/group-prices-page";

export default function AdminGroupPricesPage() {
  // Reachable only while the owner allowed administrators to manage payments (the server decides).
  return <GroupPricesPage paymentsHref="/admin/payments" groupsBasePath="/admin/groups" />;
}
