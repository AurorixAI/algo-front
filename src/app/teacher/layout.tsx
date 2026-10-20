"use client";

import { Sidebar, useSidebarStore } from "@/components/layout/sidebar";
import { BOTTOM_NAV_CLEARANCE } from "@/components/layout/bottom-nav";
import { AuthGuard } from "@/components/auth";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <AuthGuard allowedRoles={["teacher"]} forbiddenPath="/">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30">
        <Sidebar />
        <main className={`min-w-0 ${collapsed ? "md:ml-[calc(68px+env(safe-area-inset-left))]" : "md:ml-[calc(240px+env(safe-area-inset-left))]"} p-3 sm:p-5 lg:p-8 max-md:pl-[max(0.75rem,env(safe-area-inset-left))] max-md:pr-[max(0.75rem,env(safe-area-inset-right))] ${BOTTOM_NAV_CLEARANCE} transition-all duration-300`}>{children}</main>
      </div>
    </AuthGuard>
  );
}
