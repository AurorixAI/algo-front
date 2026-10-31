"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Inbox, LifeBuoy, LogOut, Menu, ScrollText, ShieldCheck, UserCog, Users, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { consoleApi } from "../lib/api";
import { SessionGate, useSession } from "../lib/session";
import { NAV_ITEMS, activeNav, can, visibleNav, type NavItem } from "../lib/permissions";
import { initials } from "../lib/format";
import type { Me } from "../lib/types";

const ICONS: Record<NavItem["key"], LucideIcon> = {
  requests: Inbox,
  support: LifeBuoy,
  centres: Building2,
  users: Users,
  team: UserCog,
  roles: ShieldCheck,
  audit: ScrollText,
};

/** Dispatched after a request changes status, so the sidebar badge does not wait for its timer. */
export const REQUESTS_CHANGED = "console:requests-changed";
export function notifyRequestsChanged() {
  window.dispatchEvent(new Event(REQUESTS_CHANGED));
}

const BADGE_REFRESH_MS = 60_000;

/** Dispatched after a ticket changes (an answer, a status), so the badge of «Обращения» does not wait for its timer. */
export const SUPPORT_CHANGED = "console:support-changed";
export function notifySupportChanged() {
  window.dispatchEvent(new Event(SUPPORT_CHANGED));
}

/** A number for a badge of the sidebar: loaded now, every minute, and when `event` is dispatched.  A failure keeps the last number (the badge is a hint). */
function useBadgeCount(enabled: boolean, load: () => Promise<number>, event: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(() => {
    if (!enabled) return;
    loadRef.current().then(setCount).catch(() => { /* the badge is a hint: a failure keeps the last number */ });
  }, [enabled]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, BADGE_REFRESH_MS);
    window.addEventListener(event, refresh);
    return () => { clearInterval(timer); window.removeEventListener(event, refresh); };
  }, [refresh, event]);
  return count;
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  const active = activeNav(pathname);
  const { signOut } = useSession();
  const newCount = useBadgeCount(can(me, "requests.view"), () => consoleApi.requests.list({ page_size: 1 }).then((page) => page.counts?.new ?? 0), REQUESTS_CHANGED);
  const supportNew = useBadgeCount(can(me, "support.manage"), () => consoleApi.support.summary().then((data) => data.new ?? 0), SUPPORT_CHANGED);
  const items = visibleNav(me);
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-lg font-bold text-white">∫</div>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-white">ALGO</p>
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Консоль</p>
        </div>
      </div>
      <nav aria-label="Разделы консоли" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400",
                isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.key === "requests" && newCount !== null && newCount > 0 && (
                <span
                  className="min-w-[1.4rem] rounded-full bg-primary-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"
                  aria-label={`Новых заявок: ${newCount}`}
                  data-testid="new-requests-badge"
                >
                  {newCount > 99 ? "99+" : newCount}
                </span>
              )}
              {item.key === "support" && supportNew !== null && supportNew > 0 && (
                <span
                  className="min-w-[1.4rem] rounded-full bg-primary-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"
                  aria-label={`Новых обращений: ${supportNew}`}
                  data-testid="new-support-badge"
                >
                  {supportNew > 99 ? "99+" : supportNew}
                </span>
              )}
            </Link>
          );
        })}
        {items.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Нет доступных разделов</p>}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-200">{initials(me.user.name)}</div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-slate-100">{me.user.name}</p>
            <p className="truncate text-xs text-slate-500">{me.is_owner ? "Владелец платформы" : me.role?.name ?? "Сотрудник"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut(false)}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Выйти
        </button>
        {confirmAll ? (
          <div className="mt-1 rounded-lg bg-white/5 p-2 text-xs text-slate-300">
            Завершить вход на всех устройствах?
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void signOut(true)} className="rounded-md bg-red-500/90 px-2 py-1 font-medium text-white hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">Да, выйти везде</button>
              <button type="button" onClick={() => setConfirmAll(false)} className="rounded-md px-2 py-1 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400">Отмена</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmAll(true)} className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-slate-500 hover:text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400">
            Выйти везде
          </button>
        )}
      </div>
    </div>
  );
}

/** The frame of every panel page: the guard, the dark sidebar (a drawer on a phone), the content column. */
export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <SessionGate page="panel">
      {(me) => <Frame me={me}>{children}</Frame>}
    </SessionGate>
  );
}

function Frame({ me, children }: { me: Me; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#console-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg">
        К содержимому
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block"><Sidebar me={me} /></aside>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
        <button
          type="button"
          aria-label="Открыть меню"
          aria-expanded={drawer}
          onClick={() => setDrawer(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">ALGO · Консоль</span>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Меню консоли">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <button type="button" aria-label="Закрыть меню" onClick={() => setDrawer(false)} className="absolute right-2 top-3 z-10 rounded-lg p-2 text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400">
              <X className="h-5 w-5" />
            </button>
            <Sidebar me={me} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <main id="console-main" ref={mainRef} tabIndex={-1} className="px-4 py-6 outline-none lg:ml-60 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}

export { NAV_ITEMS };
