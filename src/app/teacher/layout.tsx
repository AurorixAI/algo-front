"use client";

import { Sidebar, useSidebarStore } from "@/components/layout/sidebar";
import { AuthGuard } from "@/components/auth";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  return (
    <AuthGuard
      allowedRoles={["teacher"]}
      forbiddenPath="/"
      forbiddenRolePaths={{ admin: "/admin/dashboard", owner: "/owner/dashboard" }}
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30">
        <Sidebar />
        <main className={`${collapsed ? "ml-[68px]" : "ml-[240px]"} p-8 transition-all duration-300`}>{children}</main>
      </div>
    </AuthGuard>
  );
}
