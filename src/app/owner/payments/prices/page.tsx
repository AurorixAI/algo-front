"use client";

import { GroupPricesPage } from "@/components/payments/group-prices-page";

export default function OwnerGroupPricesPage() {
  return <GroupPricesPage paymentsHref="/owner/payments" groupsBasePath="/owner/groups" />;
}
