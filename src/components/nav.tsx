"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChartColumn,
  CirclePlus,
  CircleUserRound,
  House,
  Target,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "วันนี้", Icon: House },
  { href: "/plan", label: "แผนซ้อม", Icon: CalendarDays },
  { href: "/journal", label: "บันทึก", Icon: CirclePlus },
  { href: "/goals", label: "เป้าหมาย", Icon: Target },
  { href: "/progress", label: "สถิติ", Icon: ChartColumn },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type HeaderProps = { initial: string | null };

function ProfileLink({ initial }: HeaderProps) {
  return (
    <Link
      href="/settings"
      aria-label="ตั้งค่า"
      className="app-profile-link flex size-11 items-center justify-center rounded-full transition-colors duration-200 hover:bg-forest/10"
    >
      {initial ? (
        <span
          aria-hidden="true"
          className="flex size-[clamp(36px,9vw,42px)] items-center justify-center rounded-full bg-[#ebe8e0] text-lg font-medium text-forest"
        >
          {initial}
        </span>
      ) : (
        <CircleUserRound className="size-7 text-charcoal" strokeWidth={1.75} />
      )}
    </Link>
  );
}

export function Header({ initial }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-sm lg:border-b lg:border-line lg:bg-ivory/95">
      <div className="mx-auto flex h-[60px] w-full max-w-[1180px] items-center justify-between px-5 lg:justify-end">
        <Link
          href="/"
          className="text-[clamp(22px,5.2vw,24px)] font-bold tracking-tight lg:hidden"
        >
          Runfolio
        </Link>
        <ProfileLink initial={initial} />
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
      className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper lg:hidden"
    >
      <ul className="mx-auto grid max-w-[640px] grid-cols-5 gap-1 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-button px-1 py-1 text-[clamp(11px,3vw,13px)] transition-colors duration-200",
                  active
                    ? "font-semibold text-forest"
                    : "font-normal text-muted hover:text-charcoal",
                )}
              >
                <Icon
                  className={cn(
                    "size-[clamp(22px,5.2vw,24px)]",
                    active &&
                      href === "/plan" &&
                      "[&_rect]:fill-forest [&_rect]:stroke-forest [&_path]:stroke-paper",
                  )}
                  fill={active && href === "/" ? "currentColor" : "none"}
                  strokeWidth={active ? 2 : 1.6}
                  aria-hidden
                >
                  {active && href === "/" && (
                    <path
                      d="M9 21v-8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v8Z"
                      fill="var(--color-paper)"
                      stroke="none"
                    />
                  )}
                </Icon>
                <span>{label}</span>
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
        <Link href="/" className="text-lg font-bold tracking-tight">
          Runfolio
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
