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
        <main className={`min-w-0 ${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} p-3 sm:p-5 lg:p-8 ${BOTTOM_NAV_CLEARANCE} transition-all duration-300`}>{children}</main>
      </div>
    </AuthGuard>
  );
}
