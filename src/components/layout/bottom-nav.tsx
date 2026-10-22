"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogOut, MoreHorizontal, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive, moreBadgeTotal } from "@/lib/bottom-nav";
import { navBadgeText } from "@/lib/nav-badge";
import { useDialogKeys, useScrollLock } from "@/components/ui/modal";

export interface BottomNavItem {
  href: string;
  label: string;
  /** Shorter text under the icon when the menu label is long («Панель управления» -> «Панель»). */
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Counter over the icon (hidden when 0; undefined = this item never has one). */
  badge?: number;
  /** What the counter counts, for assistive technology. */
  badgeLabel?: string;
}

export interface BottomNavProps {
  /** The four sections shown in the bar. */
  bar: BottomNavItem[];
  /** The rest of the menu: they live in the «Ещё» sheet. */
  more: BottomNavItem[];
  /** The sections are not known yet: the bar is drawn as a skeleton of five slots, so nothing moves when they arrive. */
  pending?: boolean;
  pathname: string;
  /** A role's quick action (the teacher's «Создать экзамен»): the first row under the sections. */
  quickAction?: { href: string; label: string; icon: React.ComponentType<{ className?: string }> };
  settingsPath: string;
  profile: { name: string; role: string; org: string; initial: string };
  onLogout: () => void;
}

const MORE_ID = "bottom-nav-more";

/**
 * Bottom padding of `<main>` on a phone: the bar (4 rem + the iPhone's safe area) and a little air, so the last line of a
 * page is never under the bar.  `!` because a layout's own responsive padding (`sm:p-5`) would otherwise win between 640 and
 * 767 px; from 768 px (no bar) and on paper the page's own padding applies.  Written out in full so Tailwind finds it.
 */
export const BOTTOM_NAV_CLEARANCE = "max-md:!pb-[calc(5rem+env(safe-area-inset-bottom))] print:!pb-0";

function counterLabel(item: BottomNavItem): string | undefined {
  return item.badge ? `${item.badgeLabel ?? "Требуют действий"}: ${item.badge}` : undefined;
}

/** The counter on an icon's corner.  The slot exists from the first paint and only fades in: a late counter moves nothing. */
function Counter({ count, className }: { count: number | undefined; className?: string }) {
  if (count === undefined) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute -right-2 -top-1.5 h-4 min-w-[16px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white transition-opacity duration-300",
        count ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {navBadgeText(count)}
    </span>
  );
}

/**
 * Phone navigation (under 768 px): a bar at the bottom edge with the role's four main sections and «Ещё».  The left
 * rail is hidden there.  Tablet and desktop do not render this at all (CSS `md:hidden`).
 *
 * «Ещё» opens a bottom sheet with the remaining sections, the profile, the settings and «Выйти из системы».  The
 * counters of the sections hidden in the sheet are summed on the «Ещё» icon.
 */
export function BottomNav({ bar, more, pending = false, pathname, quickAction, settingsPath, profile, onLogout }: BottomNavProps) {
  const [open, setOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // The toast column (`#toast-host`) lifts above the bar while this bar exists (see globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-bottom-nav", "");
    return () => root.removeAttribute("data-bottom-nav");
  }, []);

  // A page change (a link of the sheet, the browser's back button) closes the sheet.
  useEffect(() => setOpen(false), [pathname]);

  // The sheet is a phone layer: when the window grows to a tablet (rotation) it goes away with the bar.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const moreCount = moreBadgeTotal(more);
  const moreActive = more.some((item) => isNavActive(pathname, item.href)) || isNavActive(pathname, settingsPath);
  const moreName = moreCount ? `Ещё, требуют действий: ${moreCount}` : "Ещё";

  const cell = "relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0 outline-none focus-visible:bg-slate-50 [-webkit-tap-highlight-color:transparent]";

  return (
    <>
      <nav
        aria-label="Основное меню"
        data-testid="bottom-nav"
        aria-busy={pending ? true : undefined}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-md md:hidden print:hidden"
      >
        {pending ? (
          <ul aria-hidden="true" data-testid="bottom-nav-skeleton" className="flex h-16 items-stretch">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5">
                <span className="h-7 w-14 rounded-full bg-slate-100" />
                <span className="h-2 w-10 rounded bg-slate-100" />
              </li>
            ))}
          </ul>
        ) : (
        <ul className="flex h-16 items-stretch">
          {bar.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            const label = item.shortLabel ?? item.label;
            const counter = counterLabel(item);
            return (
              <li key={item.href} className="flex min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={counter ? `${item.label}, ${counter.toLowerCase()}` : undefined}
                  className={cell}
                >
                  <span className={cn("flex h-7 w-14 items-center justify-center rounded-full transition-colors", active ? "bg-primary-100 text-primary-700" : "text-slate-500")}>
                    <span className="relative flex">
                      <Icon className="h-[22px] w-[22px]" />
                      <Counter count={item.badge} />
                    </span>
                  </span>
                  <span className={cn("max-w-full truncate text-[11px] max-[359px]:text-[10px] leading-none tracking-tight", active ? "font-semibold text-primary-700" : "font-medium text-slate-500")}>{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex min-w-0 flex-1">
            <button
              ref={moreButtonRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? MORE_ID : undefined}
              aria-label={moreName}
              aria-current={moreActive ? "page" : undefined}
              onClick={() => setOpen((value) => !value)}
              className={cn(cell, "w-full")}
            >
              <span className={cn("flex h-7 w-14 items-center justify-center rounded-full transition-colors", moreActive || open ? "bg-primary-100 text-primary-700" : "text-slate-500")}>
                <span className="relative flex">
                  <MoreHorizontal className="h-[22px] w-[22px]" />
                  <Counter count={more.some((item) => item.badge !== undefined) ? moreCount : undefined} />
                </span>
              </span>
              <span className={cn("max-w-full truncate text-[11px] max-[359px]:text-[10px] leading-none tracking-tight", moreActive || open ? "font-semibold text-primary-700" : "font-medium text-slate-500")}>Ещё</span>
            </button>
          </li>
        </ul>
        )}
      </nav>

      <MoreSheet
        open={open && !pending}
        onClose={close}
        returnFocusTo={moreButtonRef}
        more={more}
        pathname={pathname}
        quickAction={quickAction}
        settingsPath={settingsPath}
        profile={profile}
        onLogout={onLogout}
      />
    </>
  );
}

interface MoreSheetProps extends Omit<BottomNavProps, "bar"> {
  open: boolean;
  onClose: () => void;
  returnFocusTo: { current: HTMLElement | null };
}

const ROW = "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40";

function MoreSheet({ open, onClose, returnFocusTo, more, pathname, quickAction, settingsPath, profile, onLogout }: MoreSheetProps) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => setMounted(true), []);
  useScrollLock(open);
  useDialogKeys(open, sheetRef, { onClose });

  // Focus goes to the first row on open and comes back to «Ещё» on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = returnFocusTo.current;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>("[data-sheet-row]");
    (first ?? sheet)?.focus({ preventScroll: true });
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, returnFocusTo]);

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bottom-nav-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-[100] touch-none bg-slate-900/40 backdrop-blur-sm md:hidden print:hidden"
            onClick={onClose}
          />
          <motion.div
            key="bottom-nav-sheet"
            ref={sheetRef}
            id={MORE_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Ещё"
            tabIndex={-1}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-x-0 bottom-0 z-[110] flex max-h-[85vh] supports-[height:100dvh]:max-h-[85dvh] flex-col rounded-t-3xl border-t border-slate-100 bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl outline-none md:hidden print:hidden"
          >
            <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-sm font-bold uppercase text-white">
                {profile.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{profile.name}</p>
                <p className="truncate text-xs text-slate-500">{profile.role} · {profile.org}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                className="-mr-1 rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
              {more.length > 0 && (
                <ul className="space-y-0.5">
                  {more.map((item) => {
                    const active = isNavActive(pathname, item.href);
                    const Icon = item.icon;
                    const counter = counterLabel(item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          data-sheet-row
                          aria-current={active ? "page" : undefined}
                          onClick={onClose}
                          className={cn(ROW, active ? "bg-primary-50 font-bold text-primary-700" : "text-slate-700 active:bg-slate-100")}
                        >
                          <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary-600" : "text-slate-400")} />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span
                              aria-label={counter}
                              className="h-5 min-w-[20px] shrink-0 rounded-full bg-rose-500 px-1.5 text-center text-xs font-bold leading-5 text-white"
                            >
                              {navBadgeText(item.badge)}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <ul className={cn("space-y-0.5", more.length > 0 && "mt-2 border-t border-slate-100 pt-2")}>
                {quickAction && (
                  <li>
                    <Link href={quickAction.href} data-sheet-row onClick={onClose} className={cn(ROW, "text-slate-700 active:bg-slate-100")}>
                      <quickAction.icon className="h-5 w-5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{quickAction.label}</span>
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href={settingsPath}
                    data-sheet-row
                    aria-current={isNavActive(pathname, settingsPath) ? "page" : undefined}
                    onClick={onClose}
                    className={cn(ROW, isNavActive(pathname, settingsPath) ? "bg-primary-50 font-bold text-primary-700" : "text-slate-700 active:bg-slate-100")}
                  >
                    <Settings className={cn("h-5 w-5 shrink-0", isNavActive(pathname, settingsPath) ? "text-primary-600" : "text-slate-400")} />
                    <span className="min-w-0 flex-1 truncate">Настройки</span>
                  </Link>
                </li>
                <li>
                  <button type="button" data-sheet-row onClick={() => { onClose(); onLogout(); }} className={cn(ROW, "text-red-600 active:bg-red-50")}>
                    <LogOut className="h-5 w-5 shrink-0 text-red-500" />
                    <span>Выйти из системы</span>
                  </button>
                </li>
              </ul>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(content, document.body) : null;
}
