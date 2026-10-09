"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CalendarDays,
  ChartColumn,
  CircleUserRound,
  House,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "วันนี้", Icon: House },
  { href: "/plan", label: "แผนซ้อม", Icon: CalendarDays },
  { href: "/journal", label: "บันทึก", Icon: BookOpenText },
  { href: "/goals", label: "เป้าหมาย", Icon: Target },
  { href: "/progress", label: "สถิติ", Icon: ChartColumn },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ivory">
      <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between px-4 sm:px-5 lg:justify-end">
        <Link href="/" className="text-base font-semibold lg:hidden">
          Running Journal
        </Link>
        <Link
          href="/settings"
          aria-label="ตั้งค่า"
          className="flex size-11 items-center justify-center rounded-full text-charcoal transition-colors duration-200 hover:bg-forest/10"
        >
          <CircleUserRound className="size-7" strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper lg:hidden"
    >
      <ul className="grid grid-cols-5 gap-1 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-button px-1 py-1.5 text-xs transition-colors duration-200",
                  active
                    ? "font-semibold text-forest"
                    : "font-normal text-muted hover:text-charcoal",
                )}
              >
                <Icon
                  className="size-5"
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span>{label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "size-1 rounded-full bg-forest",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-paper lg:flex">
      <div className="flex h-14 items-center border-b border-line px-5">
        <Link href="/" className="text-base font-semibold">
          Running Journal
        </Link>
      </div>
      <nav
        aria-label="เมนูหลัก"
        data-testid="sidebar"
        className="flex-1 px-3 py-4"
      >
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-button px-3 text-[15px] transition-colors duration-200",
                    active
                      ? "bg-forest/10 font-semibold text-forest"
                      : "font-normal text-muted hover:bg-ivory hover:text-charcoal",
                  )}
                >
                  <Icon
                    className="size-5"
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
