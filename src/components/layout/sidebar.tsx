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
  Banknote,
  Repeat2,
  LifeBuoy,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCK_COPY } from "@/lib/lock-copy";
import { useAuthStore } from "@/lib/store";
import { useState, useRef, useEffect } from "react";
import { create } from "zustand";
import { DEMO_MODE } from "@/lib/api";
import { selectBadgeTotal, useExcuseBadge } from "@/lib/excuse-badge";
import { useSubstitutionBadge } from "@/lib/substitution-badge";
import { BADGE_LABEL } from "@/lib/substitutions";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { effectiveRole } from "@/lib/role-home";
import { staffDisplayName } from "@/lib/staff-name";
import { navBadgeText } from "@/lib/nav-badge";
import { debtorsCount } from "@/lib/payments";
import { BOTTOM_BAR_WAIT_MS, BOTTOM_NAV_PRIORITY, bottomBarPending, splitBottomNav } from "@/lib/bottom-nav";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SupportDialog } from "@/components/support/support-dialog";
import { useSupportDialog } from "@/lib/support-store";
import { SUPPORT_LABEL, SUPPORT_MY_LABEL, bindClientErrorsTo, resetClientErrors } from "@/lib/support";
import { SUPPORT_UNREAD_POLL_MS, useSupportUnread } from "@/lib/support-unread";

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
  /** Shorter text under the icon of the phone's bottom bar. */
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  /** Counter shown over the icon (hidden when 0 or undefined). */
  badge?: number;
  /** What the counter counts, for the tooltip. */
  badgeLabel?: string;
}

/**
 * The role's menu.  Tablet and desktop (from 768 px): the left rail, collapsible.  Phone (under 768 px): the rail is
 * hidden and the same menu is a bar at the bottom edge (`BottomNav`): four sections and «Ещё» with the rest, the profile
 * and sign-out.  Both are fed from the lists below, so the counters and the role rules exist once.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, org, logout } = useAuthStore();
  const { collapsed, toggle } = useSidebarStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  const rawRole = effectiveRole(user) || "teacher";
  const role = rawRole === "owner" ? "admin" : rawRole;
  const isTeacher = rawRole === "teacher";

  // Organisation display name
  const orgName = org?.name || user?.org_name || "ALGO";

  // Excused absences waiting for a decision: administrators and owners only,
  // never in the demo build (the demo API has no such endpoint).
  const showExcuses = !DEMO_MODE && (rawRole === "owner" || role === "admin");
  const pendingExcuses = useExcuseBadge(selectBadgeTotal);
  const refreshExcuses = useExcuseBadge((state) => state.refresh);
  // «Замены» (LOGIC-B2): the requests of teachers waiting for a decision; the same people see it, the same rhythm of refresh.
  const pendingSubstitutions = useSubstitutionBadge((state) => state.pending);
  const refreshSubstitutions = useSubstitutionBadge((state) => state.refresh);
  useEffect(() => {
    if (!showExcuses) return;
    void refreshExcuses();
    void refreshSubstitutions();
  }, [showExcuses, pathname, refreshExcuses, refreshSubstitutions]);
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
      void refreshSubstitutions();
    };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [showExcuses, refreshExcuses, refreshSubstitutions]);

  // Payments: the item exists only while the server lets this user see them (owner always,
  // administrator once the owner enabled it). The summary itself is kept fresh by the banner
  // in the layout; a teacher never reads it.
  const paymentsAvailable = usePaymentsSummary((state) => state.available);
  const paymentsKnown = usePaymentsSummary((state) => state.loaded);
  // One number for the owner everywhere: the badge, the banner and the card «Долг учеников» count the DEBTORS (students with a debt).
  const paymentsDue = usePaymentsSummary((state) => debtorsCount({ debtors: state.debtors, students_with_debt: state.studentsWithDebt }) ?? 0);
  // The owner always has access, so the item is there from the first paint (no jump when the
  // summary arrives); an administrator sees it once the server confirms the access.
  const showPayments = !DEMO_MODE && (rawRole === "owner" || (role === "admin" && paymentsAvailable));

  const adminNav: NavItem[] = [
    { href: "/admin/diagnostics", label: "Диагностика", icon: Search },
    { href: "/admin/exams", label: "Экзамены", icon: FileText },
    { href: "/admin/students", label: "Ученики", icon: GraduationCap },
    { href: "/admin/groups", label: "Группы", icon: Users },
    { href: "/admin/teachers", label: "Сотрудники", icon: Shield },
    ...(showExcuses
      ? [{ href: "/admin/attendance", label: "Посещаемость", shortLabel: "Посещения", icon: ClipboardCheck, badge: pendingExcuses }]
      : []),
    ...(showExcuses
      ? [{ href: "/admin/substitutions", label: "Замены", icon: Repeat2, badge: pendingSubstitutions, badgeLabel: BADGE_LABEL }]
      : []),
    ...(showPayments
      ? [{ href: "/admin/payments", label: "Оплаты", icon: Wallet, badge: paymentsDue, badgeLabel: "Должники" }]
      : []),
  ];

  const ownerNav: NavItem[] = [
    { href: "/owner/dashboard", label: "Панель управления", shortLabel: "Панель", icon: LayoutDashboard },
    { href: "/owner/groups", label: "Группы", icon: Users },
    { href: "/owner/students", label: "Ученики", icon: GraduationCap },
    ...(showExcuses
      ? [{ href: "/owner/attendance", label: "Посещаемость", shortLabel: "Посещения", icon: ClipboardCheck, badge: pendingExcuses }]
      : []),
    ...(showExcuses
      ? [{ href: "/owner/substitutions", label: "Замены", icon: Repeat2, badge: pendingSubstitutions, badgeLabel: BADGE_LABEL }]
      : []),
    ...(showPayments
      ? [{ href: "/owner/payments", label: "Оплаты", icon: Wallet, badge: paymentsDue, badgeLabel: "Должники" }]
      : []),
    // Payroll is the owner's alone (N13 P3): no item for an administrator or a teacher, and none in the demo.
    ...(!DEMO_MODE && rawRole === "owner"
      ? [{ href: "/owner/payroll", label: "Зарплата", icon: Banknote }]
      : []),
    { href: "/owner/teachers", label: "Сотрудники", icon: Shield },
  ];

  const teacherNav: NavItem[] = [
    { href: "/teacher/dashboard", label: "Дашборд", icon: LayoutDashboard },
    { href: "/teacher/schedule", label: "Расписание", icon: Calendar },
    { href: "/teacher/exams", label: "Экзамены", icon: FileText },
    { href: "/teacher/groups", label: "Мои группы", shortLabel: "Группы", icon: Users },
  ];

  const navItems = rawRole === "owner" ? ownerNav : role === "admin" ? adminNav : teacherNav;
  const settingsPath = rawRole === "owner" ? "/owner/settings" : role === "admin" ? "/admin/settings" : "/teacher/settings";
  const displayRole = rawRole === "owner" ? "Владелец" : role === "admin" ? "Администратор" : "Преподаватель";
  const displayName = staffDisplayName(user, displayRole);
  const { bar: barItems, more: moreItems } = splitBottomNav(
    navItems.filter((item) => !item.comingSoon),
    BOTTOM_NAV_PRIORITY[rawRole === "owner" ? "owner" : role === "admin" ? "admin" : "teacher"],
  );

  // The administrator's bar waits (as a skeleton) for the one fact that decides its slots; see `bottomBarPending`.
  const [barGaveUp, setBarGaveUp] = useState(false);
  useEffect(() => {
    if (paymentsKnown || barGaveUp) return undefined;
    const timer = window.setTimeout(() => setBarGaveUp(true), BOTTOM_BAR_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [paymentsKnown, barGaveUp]);
  const barPending = bottomBarPending({
    role: rawRole === "owner" ? "owner" : role === "admin" ? "admin" : "teacher",
    demo: DEMO_MODE,
    summaryLoaded: paymentsKnown,
    gaveUp: barGaveUp,
  });

  const showSupport = useSupportDialog((state) => state.show);
  const supportPath = rawRole === "owner" ? "/owner/support" : role === "admin" ? "/admin/support" : "/teacher/support";
  const supportUnread = useSupportUnread((state) => state.count);

  // The failed calls of the ring belong to the person who is signed in now; the badge of «Мои обращения» asks at sign-in and every two minutes (not in the demo: no server).
  useEffect(() => {
    bindClientErrorsTo(user?.id);
    if (DEMO_MODE || !user?.id) return undefined;
    void useSupportUnread.getState().load();
    const timer = window.setInterval(() => void useSupportUnread.getState().load(), SUPPORT_UNREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  const handleLogout = () => {
    usePaymentsSummary.getState().reset();
    useSubstitutionBadge.getState().reset();
    useSupportUnread.getState().reset();
    resetClientErrors();
    logout();
    router.push("/login");
  };

  // Close the profile menu on a press outside (mouse and touch) and on Escape (keyboard).  The menu is click-driven
  // (no hover), anchored to the bottom of the fixed sidebar, so the viewport edge and page scroll cannot clip it.
  useEffect(() => {
    if (!profileOpen) return undefined;
    function handleClickOutside(e: PointerEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setProfileOpen(false);
      profileButtonRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  return (
    <>
    <aside
      className={cn(
        "fixed left-0 top-0 hidden h-screen bg-white border-r border-slate-200/80 md:flex flex-col transition-all duration-300 shrink-0 z-40 select-none print:hidden",
        // The rail grows by the notch of a phone held sideways, so its content stays clear of it.
        "pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)]",
        collapsed ? "w-[calc(68px+env(safe-area-inset-left))]" : "w-[calc(240px+env(safe-area-inset-left))]"
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
      <nav aria-label="Основное меню" className="flex-1 py-3 px-3 overflow-x-hidden overflow-y-auto flex flex-col">
        {/* Fixed-height section title container so navigation items never jump vertically */}
        <div className="h-6 px-3 flex items-center shrink-0">
          <span
            className={cn(
              "text-xs font-semibold text-slate-500 transition-opacity duration-300 whitespace-nowrap select-none overflow-hidden",
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
                {/* The counter hangs on the icon's top-right corner, inside the link's clip edge: it cannot be cut off
                    whatever the number of digits (the link clips its label, not the counter). */}
                <span className="relative flex shrink-0">
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0 transition-colors",
                      isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
                    )}
                  />
                  {item.badge !== undefined ? (
                    // The slot exists from the first paint and only fades in: a counter that arrives
                    // late neither pops in nor moves anything (it sits over the icon).
                    <span
                      aria-hidden={item.badge ? undefined : true}
                      aria-label={item.badge ? `${item.badgeLabel ?? "Требуют действий"}: ${item.badge}` : undefined}
                      title={item.badge ? `${item.badgeLabel ?? "Требуют действий"}: ${item.badge}` : undefined}
                      className={cn(
                        "pointer-events-none absolute -right-1.5 -top-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-4 text-center ring-2 ring-white transition-opacity duration-300",
                        item.badge ? "opacity-100" : "opacity-0",
                      )}
                    >
                      {navBadgeText(item.badge)}
                    </span>
                  ) : null}
                </span>
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
                  <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">
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
                  <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-300 shrink-0">
                    {LOCK_COPY.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Collapse button (above profile) - centered horizontally */}
      <div className="px-3 pt-1 pb-1 shrink-0">
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
            id="sidebar-profile-menu"
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
                <span>Настройки</span>
              </button>
              {!DEMO_MODE && (
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); showSupport(); }}
                  data-testid="profile-support"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left"
                >
                  <LifeBuoy className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{SUPPORT_LABEL}</span>
                </button>
              )}
              {!DEMO_MODE && (
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); router.push(supportPath); }}
                  data-testid="profile-my-support"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left"
                >
                  <MessagesSquare className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{SUPPORT_MY_LABEL}</span>
                  {supportUnread > 0 && (
                    <span data-testid="support-unread-badge" aria-label={`Есть ответ: ${supportUnread}`} className="h-4 min-w-[16px] shrink-0 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {navBadgeText(supportUnread)}
                    </span>
                  )}
                </button>
              )}
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
          ref={profileButtonRef}
          type="button"
          aria-expanded={profileOpen}
          aria-controls={profileOpen ? "sidebar-profile-menu" : undefined}
          onClick={() => setProfileOpen(!profileOpen)}
          className={cn(
            "w-full flex items-center rounded-xl p-2 transition-all text-left group outline-none focus:outline-none overflow-hidden h-12",
            profileOpen ? "bg-slate-100" : "hover:bg-slate-50"
          )}
        >
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-2xs uppercase">
            {user?.first_name?.[0] || user?.full_name?.[0] || role[0]}
            {supportUnread > 0 && <span aria-hidden="true" data-testid="support-unread-dot" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
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

    <BottomNav
      bar={barItems}
      more={moreItems}
      pending={barPending}
      pathname={pathname}
      quickAction={isTeacher ? { href: "/teacher/exams/new", label: "Создать экзамен", icon: Plus } : undefined}
      settingsPath={settingsPath}
      profile={{
        name: displayName,
        role: displayRole,
        org: orgName,
        initial: user?.first_name?.[0] || user?.full_name?.[0] || role[0],
      }}
      onLogout={handleLogout}
      supportPath={DEMO_MODE ? undefined : supportPath}
      supportUnread={supportUnread}
      onSupport={DEMO_MODE ? undefined : showSupport}  // the demo has no accounting server: nobody to write to
    />
    <SupportDialog />
    </>
  );
}
