"use client";

import { Sidebar, useSidebarStore } from "@/components/layout/sidebar";
import { BOTTOM_NAV_CLEARANCE } from "@/components/layout/bottom-nav";
import { AuthGuard } from "@/components/auth";
import { PaymentsAlertBanner } from "@/components/payments/payments-alert-banner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <AuthGuard allowedRoles={["admin", "owner"]} forbiddenPath="/">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30 print:bg-none print:bg-white">
        <Sidebar />
        <main className={`${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} min-w-0 p-4 md:p-8 ${BOTTOM_NAV_CLEARANCE} transition-all duration-300 print:ml-0 print:p-0`}>
          <PaymentsAlertBanner paymentsBasePath="/admin/payments" />
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
