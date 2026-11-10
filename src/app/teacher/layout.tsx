"use client";

import { Sidebar, useSidebarStore } from "@/components/layout/sidebar";
import { BOTTOM_NAV_CLEARANCE } from "@/components/layout/bottom-nav";
import { AuthGuard } from "@/components/auth";
import { TouchDensity } from "@/components/ui/touch-density";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <AuthGuard allowedRoles={["teacher"]} forbiddenPath="/">
      <TouchDensity />
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className={`min-w-0 ${collapsed ? "md:ml-[calc(68px+env(safe-area-inset-left))]" : "md:ml-[calc(240px+env(safe-area-inset-left))]"} p-4 md:p-8 max-md:pl-[max(1rem,env(safe-area-inset-left))] max-md:pr-[max(1rem,env(safe-area-inset-right))] ${BOTTOM_NAV_CLEARANCE} transition-all duration-300`}>{children}</main>
      </div>
    </AuthGuard>
  );
}
