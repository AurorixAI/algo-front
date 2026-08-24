"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  FileText,
  BarChart3,
  BookOpen,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  UserCog,
  Shield,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCK_COPY } from "@/lib/lock-copy";
import { useAuthStore } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { create } from "zustand";

// Shared sidebar state so layouts can read collapsed width
export const useSidebarStore = create<{
  collapsed: boolean;
  toggle: () => void;
}>((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  comingSoon?: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, logout } = useAuthStore();
  const { collapsed, toggle } = useSidebarStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const rawRole = user?.role || user?.org_role || "teacher";
  const role = rawRole === "owner" ? "admin" : rawRole;
  // Читаем из org-стора (обновляется сразу через useAuthStore.setState в
  // настройках), а не из user.org_name — то поле выставляется только при
  // логине и не отражает изменения названия организации на лету.
  const orgName = org?.name || user?.org_name || "ALGO";

  const adminNav: NavItem[] = [
    { href: "/admin/dashboard", label: "Панель управления", icon: LayoutDashboard, comingSoon: true },
    { href: "/admin/diagnostics", label: "Диагностика", icon: Search },
    { href: "/admin/exams", label: "Экзамены", icon: FileText },
    { href: "/admin/students", label: "Ученики", icon: GraduationCap },
    { href: "/admin/groups", label: "Группы", icon: Users },
    { href: "/admin/analytics", label: "Аналитика", icon: BarChart3, comingSoon: true },
  ];

  const ownerNav: NavItem[] = [
    { href: "/owner/dashboard", label: "Панель управления", icon: LayoutDashboard },
    { href: "/owner/analytics", label: "Аналитика", icon: BarChart3 },
    { href: "/owner/groups", label: "Группы", icon: Users },
    { href: "/owner/teachers", label: "Сотрудники", icon: Shield },
  ];

  const teacherNav: NavItem[] = [
    { href: "/teacher/dashboard", label: "Дашборд", icon: LayoutDashboard },
    { href: "/teacher/schedule", label: "Расписание", icon: Calendar },
    { href: "/teacher/exams", label: "Экзамены", icon: FileText },
    { href: "/teacher/groups", label: "Мои группы", icon: Users },
    { href: "/teacher/analytics", label: "Аналитика", icon: BarChart3, comingSoon: true },
    { href: "/teacher/library", label: "Библиотека", icon: BookOpen, comingSoon: true },
  ];

  const navItems = rawRole === "owner" ? ownerNav : role === "admin" ? adminNav : teacherNav;
  const settingsPath = rawRole === "owner" ? "/owner/settings" : role === "admin" ? "/admin/settings" : "/teacher/settings";
  const displayRole = rawRole === "owner" ? "Владелец" : role === "admin" ? "Администратор" : "Учитель";
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user?.full_name || displayRole;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileOpen]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-white border-r border-slate-200 flex flex-col transition-all duration-300 shrink-0 z-40",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <Link href={rawRole === "owner" ? "/owner/dashboard" : role === "admin" ? "/admin/dashboard" : "/teacher/dashboard"} className="h-16 flex items-center px-4 border-b border-slate-100 gap-3 overflow-hidden hover:bg-slate-50 transition-colors">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md shadow-primary-600/20">
          ∫
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-sm leading-tight truncate">ALGO</h1>
            <p className="text-[10px] text-slate-400 truncate">{orgName}</p>
          </div>
        )}
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-x-hidden overflow-y-auto">
        {/* Active items */}
        <div className="space-y-0.5">
          {navItems.filter(i => !i.comingSoon).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl text-sm font-medium transition-all relative group",
                  collapsed ? "justify-center py-2.5" : "px-3 py-2.5",
                  isActive
                    ? "bg-primary-50 text-primary-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0",
                    isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-primary-600 text-lg leading-none">{item.badge}</span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        {navItems.some(i => i.comingSoon) && (
          <div className="my-3 px-1">
            <div className="flex items-center gap-2 h-[14px]">
              <div className="flex-1 border-t border-dashed border-slate-200" />
              {!collapsed && (
                <>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                    После подключения
                  </span>
                  <div className="flex-1 border-t border-dashed border-slate-200" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Coming soon items */}
        <div className="space-y-0.5">
          {navItems.filter(i => i.comingSoon).map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl text-sm font-medium transition-all relative cursor-default opacity-50 text-slate-400",
                  collapsed ? "justify-center py-2" : "px-3 py-2"
                )}
                title={collapsed ? `${item.label} · ${LOCK_COPY.tooltip}` : undefined}
              >
                <Icon className="w-5 h-5 shrink-0 text-slate-300" />
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-300 shrink-0">
                      {LOCK_COPY.badge}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-1">
        <button
          onClick={toggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <><ChevronLeft className="w-4 h-4" /><span>Свернуть</span></>
          )}
        </button>
      </div>

      {/* Profile with dropdown */}
      <div className="relative border-t border-slate-100 p-3" ref={profileRef}>
        {/* Dropdown menu */}
        {profileOpen && (
          <div
            className={cn(
              "absolute rounded-xl bg-white border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden z-50",
              collapsed ? "left-[68px] bottom-0 w-48" : "left-3 right-3 bottom-full mb-2"
            )}
          >
            {collapsed && (
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
                <p className="text-[10px] text-slate-400">{displayRole}</p>
              </div>
            )}
            <button
              onClick={() => { setProfileOpen(false); router.push(settingsPath); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Настройки
            </button>
            <div className="border-t border-slate-100" />
            <button
              onClick={() => { setProfileOpen(false); handleLogout(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          </div>
        )}

        {/* Profile button */}
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl p-2 transition-all",
            collapsed && "justify-center",
            profileOpen ? "bg-slate-100" : "hover:bg-slate-50"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-sm font-bold text-primary-700 shrink-0 uppercase">
            {user?.first_name?.[0] || user?.full_name?.[0] || role[0]}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
              <p className="text-[10px] text-slate-400">{displayRole}</p>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
