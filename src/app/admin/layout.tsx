"use client";

import { Sidebar, useSidebarStore } from "@/components/layout/sidebar";
import { AuthGuard } from "@/components/auth";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <AuthGuard allowedRoles={["admin", "owner"]} forbiddenPath="/">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30">
        <Sidebar compactOnMobile />
        <main className={`ml-[68px] ${collapsed ? "md:ml-[68px]" : "md:ml-[240px]"} min-w-0 p-4 md:p-8 transition-all duration-300`}>{children}</main>
      </div>
    </AuthGuard>
  );
}
