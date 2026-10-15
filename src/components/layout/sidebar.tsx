"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  Search,
  Shield,
  Calendar,
  Building2,
  Plus,
  ClipboardCheck,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCK_COPY } from "@/lib/lock-copy";
import { useAuthStore } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { create } from "zustand";
import { DEMO_MODE } from "@/lib/api";
import { selectBadgeTotal, useExcuseBadge } from "@/lib/excuse-badge";
import { usePaymentsSummary } from "@/lib/payments-summary";

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
  comingSoon?: boolean;
  /** Counter shown over the icon (hidden when 0 or undefined). */
  badge?: number;
  /** What the counter counts, for the tooltip. */
  badgeLabel?: string;
}

export function Sidebar({ compactOnMobile = false }: { compactOnMobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, logout } = useAuthStore();
  const { collapsed: storedCollapsed, toggle } = useSidebarStore();
  const [mobile, setMobile] = useState(false);
  const collapsed = storedCollapsed || (compactOnMobile && mobile);
  useEffect(() => {
    if (!compactOnMobile) return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [compactOnMobile]);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const rawRole = user?.role || user?.org_role || "teacher";
  const role = rawRole === "owner" ? "admin" : rawRole;
  const isTeacher = rawRole === "teacher";

  // Organisation display name
  const orgName = org?.name || user?.org_name || "ALGO";

  // Excused absences waiting for a decision: administrators and owners only,
  // never in the demo build (the demo API has no such endpoint).
  const showExcuses = !DEMO_MODE && (rawRole === "owner" || role === "admin");
  const pendingExcuses = useExcuseBadge(selectBadgeTotal);
  const refreshExcuses = useExcuseBadge((state) => state.refresh);
  useEffect(() => {
    if (!showExcuses) return;
    void refreshExcuses();
  }, [showExcuses, pathname, refreshExcuses]);
  useEffect(() => {
    if (!showExcuses) return;
    // Returning to the tab fires both "focus" and "visibilitychange": one request is enough.
    let lastRun = 0;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun < 1000) return;
      lastRun = now;
      void refreshExcuses();
    };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [showExcuses, refreshExcuses]);

  // Payments: the item exists only while the server lets this user see them (owner always,
  // administrator once the owner enabled it). The summary itself is kept fresh by the banner
  // in the layout; a teacher never reads it.
  const paymentsAvailable = usePaymentsSummary((state) => state.available);
  const paymentsDue = usePaymentsSummary((state) => state.due);
  const showPayments = !DEMO_MODE && (rawRole === "owner" || role === "admin") && paymentsAvailable;

  const adminNav: NavItem[] = [
    { href: "/admin/diagnostics", label: "Диагностика", icon: Search },
    { href: "/admin/exams", label: "Экзамены", icon: FileText },
    { href: "/admin/students", label: "Ученики", icon: GraduationCap },
    { href: "/admin/groups", label: "Группы", icon: Users },
    ...(showExcuses
      ? [{ href: "/admin/attendance", label: "Посещаемость", icon: ClipboardCheck, badge: pendingExcuses }]
      : []),
    ...(showPayments
      ? [{ href: "/admin/payments", label: "Оплаты", icon: Wallet, badge: paymentsDue, badgeLabel: "Требуют оплаты" }]
      : []),
  ];

  const ownerNav: NavItem[] = [
    { href: "/owner/dashboard", label: "Панель управления", icon: LayoutDashboard },
    { href: "/owner/groups", label: "Группы", icon: Users },
    ...(showExcuses
      ? [{ href: "/owner/attendance", label: "Посещаемость", icon: ClipboardCheck, badge: pendingExcuses }]
      : []),
    ...(showPayments
      ? [{ href: "/owner/payments", label: "Оплаты", icon: Wallet, badge: paymentsDue, badgeLabel: "Требуют оплаты" }]
      : []),
    { href: "/owner/teachers", label: "Сотрудники", icon: Shield },
  ];

  const teacherNav: NavItem[] = [
    { href: "/teacher/dashboard", label: "Дашборд", icon: LayoutDashboard },
    { href: "/teacher/schedule", label: "Расписание", icon: Calendar },
    { href: "/teacher/exams", label: "Экзамены", icon: FileText },
    { href: "/teacher/groups", label: "Мои группы", icon: Users },
  ];

  const navItems = rawRole === "owner" ? ownerNav : role === "admin" ? adminNav : teacherNav;
  const settingsPath = rawRole === "owner" ? "/owner/settings" : role === "admin" ? "/admin/settings" : "/teacher/settings";
  const displayRole = rawRole === "owner" ? "Владелец" : role === "admin" ? "Администратор" : "Преподаватель";
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ""}`.trim()
    : user?.full_name || displayRole;

  const handleLogout = () => {
    usePaymentsSummary.getState().reset();
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
        "fixed left-0 top-0 h-screen bg-white border-r border-slate-200/80 flex flex-col transition-all duration-300 shrink-0 z-40 select-none",
        compactOnMobile
          ? (storedCollapsed ? "w-[68px]" : "w-[68px] md:w-[240px]")
          : (collapsed ? "w-[68px]" : "w-[240px]")
      )}
    >
      {/* Header: Logo, Organization */}
      <div className="h-[72px] flex items-center px-4 border-b border-slate-100 gap-3 shrink-0 overflow-hidden">
        <Link
          href={rawRole === "owner" ? "/owner/dashboard" : role === "admin" ? "/admin/diagnostics" : "/teacher/dashboard"}
          className="flex items-center gap-3 overflow-hidden group flex-1 min-w-0"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-sm shadow-primary-600/25 group-hover:scale-105 transition-transform">
            ∫
          </div>
          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-all duration-300",
              collapsed ? "max-w-0 opacity-0" : "max-w-[160px] opacity-100"
            )}
          >
            <h1 className="font-extrabold text-slate-900 text-sm tracking-tight leading-tight">ALGO</h1>
            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5 flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{orgName}</span>
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-x-hidden overflow-y-auto flex flex-col">
        {/* Fixed-height section title container so navigation items never jump vertically */}
        <div className="h-6 px-3 flex items-center shrink-0">
          <span
            className={cn(
              "text-[10px] font-bold tracking-wider uppercase text-slate-400 transition-opacity duration-300 whitespace-nowrap select-none overflow-hidden",
              collapsed ? "opacity-0" : "opacity-100"
            )}
          >
            Навигация
          </span>
        </div>

        {/* Active items */}
        <div className="space-y-1">
          {navItems.filter(i => !i.comingSoon).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center rounded-xl text-sm font-semibold transition-all relative overflow-hidden group h-10 px-3 shrink-0",
                  isActive
                    ? "bg-primary-50 text-primary-700 font-bold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                title={collapsed ? (item.badge ? `${item.label} · ${(item.badgeLabel ?? "требуют действий").toLowerCase()}: ${item.badge}` : item.label) : undefined}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary-600" />
                )}
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-colors",
                    isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                {item.badge ? (
                  <span
                    aria-label={`${item.badgeLabel ?? "Требуют действий"}: ${item.badge}`}
                    title={`${item.badgeLabel ?? "Требуют действий"}: ${item.badge}`}
                    className="absolute left-[27px] top-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4 text-center ring-2 ring-white"
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "whitespace-nowrap overflow-hidden transition-all duration-300 ml-3",
                    item.label.length > 18 && "text-[12.5px] tracking-tight",
                    collapsed ? "max-w-0 opacity-0 ml-0" : item.label.length > 18 ? "max-w-[164px] opacity-100" : "max-w-[150px] opacity-100"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Quick action button for teacher: Seamlessly transforms into a '+' button when collapsed */}
        {isTeacher && (
          <div className="pt-3 shrink-0">
            <Link
              href="/teacher/exams/new"
              className={cn(
                "w-full flex items-center justify-center h-10 rounded-xl text-xs font-bold transition-all shadow-2xs group overflow-hidden relative border",
                "text-slate-700 bg-slate-50/80 hover:bg-primary-50 hover:text-primary-700 border-slate-200/80 hover:border-primary-200",
                collapsed ? "px-0 gap-0" : "px-3 gap-2"
              )}
              title={collapsed ? "Создать экзамен" : undefined}
            >
              <Plus className="w-4 h-4 text-slate-400 group-hover:text-primary-600 transition-colors shrink-0" />
              <span
                className={cn(
                  "whitespace-nowrap overflow-hidden transition-all duration-300 text-xs font-bold",
                  collapsed ? "max-w-0 opacity-0" : "max-w-[150px] opacity-100"
                )}
              >
                Создать экзамен
              </span>
            </Link>
          </div>
        )}

        {/* Divider for Coming Soon */}
        {navItems.some(i => i.comingSoon) && (
          <div className="my-3 px-1 shrink-0">
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
                className="flex items-center rounded-xl text-sm font-medium transition-all relative cursor-default opacity-50 text-slate-400 h-10 px-3 shrink-0 overflow-hidden"
                title={collapsed ? `${item.label} · ${LOCK_COPY.tooltip}` : undefined}
              >
                <Icon className="w-5 h-5 shrink-0 text-slate-300" />
                <span
                  className={cn(
                    "whitespace-nowrap overflow-hidden transition-all duration-300 ml-3",
                    collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[120px] opacity-100"
                  )}
                >
                  {item.label}
                </span>
                {!collapsed && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-300 shrink-0">
                    {LOCK_COPY.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Collapse button (above profile) - centered horizontally */}
      <div className={cn("px-3 pt-1 pb-1 shrink-0", compactOnMobile && "hidden md:block")}>
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-center gap-2 h-9 px-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors overflow-hidden group"
        >
          <ChevronLeft
            className={cn(
              "w-4 h-4 shrink-0 transition-transform duration-300 text-slate-400 group-hover:text-slate-600",
              collapsed && "rotate-180"
            )}
          />
          <span
            className={cn(
              "whitespace-nowrap overflow-hidden transition-all duration-300 text-xs font-semibold",
              collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"
            )}
          >
            Свернуть сайдбар
          </span>
        </button>
      </div>

      {/* Profile & Controls Footer */}
      <div className="relative border-t border-slate-150 p-2 bg-slate-50/40 shrink-0" ref={profileRef}>
        {/* Dropdown menu */}
        {profileOpen && (
          <div
            className={cn(
              "absolute bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden z-50 ring-1 ring-black/5",
              collapsed ? "left-[68px] bottom-0 w-52" : "left-2 right-2 bottom-full mb-2"
            )}
          >
            <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-900 truncate">{displayName}</p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">{orgName}</span>
              </p>
            </div>
            <div className="p-1">
              <button
                type="button"
                onClick={() => { setProfileOpen(false); router.push(settingsPath); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left"
              >
                <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Настройки аккаунта</span>
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => { setProfileOpen(false); handleLogout(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-red-500 shrink-0" />
                <span>Выйти из системы</span>
              </button>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <button
          type="button"
          onClick={() => setProfileOpen(!profileOpen)}
          className={cn(
            "w-full flex items-center rounded-xl p-2 transition-all text-left group outline-none focus:outline-none overflow-hidden h-12",
            profileOpen ? "bg-slate-100" : "hover:bg-slate-50"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-2xs uppercase">
            {user?.first_name?.[0] || user?.full_name?.[0] || role[0]}
          </div>
          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-all duration-300 ml-2.5",
              collapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[160px] opacity-100"
            )}
          >
            <p className="text-xs font-bold text-slate-800 truncate group-hover:text-primary-700 transition-colors">{displayName}</p>
            <p className="text-[10px] text-slate-400 font-medium truncate flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">{displayRole}</span>
            </p>
          </div>
        </button>
      </div>
    </aside>
  );
}
