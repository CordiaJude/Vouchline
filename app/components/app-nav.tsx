"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/app/app/actions";
import { Avatar } from "@/app/components/avatar";
import { Logo, LogoMark } from "@/app/components/logo";
import { AddSheet } from "@/app/components/add-sheet";
import { Icon, type IconName } from "@/app/components/icons";

// Four places and one action, organized around what people come to do:
//   Home    -- what needs you, then what's new
//   Explore -- find anyone (search, interests, companies, the map)
//   Add     -- a sheet: show/scan QR, add someone you know, invite
//   Intros  -- want to meet -> asked -> to pass on -> for you
//   You     -- your profile, your people, settings
// Notifications are a heart (top bar on phones, rail on desktop), not a tab.

type Tab = {
  href: string;
  label: string;
  icon: IconName;
  // Path prefixes that light this tab up.
  match: (p: string) => boolean;
};

const HOME: Tab = { href: "/app", label: "Home", icon: "home", match: (p) => p === "/app" };
const EXPLORE: Tab = {
  href: "/app/explore",
  label: "Explore",
  icon: "search",
  match: (p) => ["/app/explore", "/app/search", "/app/companies", "/app/u/"].some((x) => p.startsWith(x)),
};
const INTROS: Tab = {
  href: "/app/intros",
  label: "Intros",
  icon: "send",
  match: (p) => p.startsWith("/app/intros") || p.startsWith("/app/targets"),
};
const YOU: Tab = {
  href: "/app/me",
  label: "You",
  icon: "user",
  match: (p) =>
    ["/app/me", "/app/network", "/app/settings", "/app/connections", "/app/admin", "/app/connect", "/app/claim"].some(
      (x) => p.startsWith(x),
    ),
};
const MAP: Tab = {
  href: "/app/explore?view=map",
  label: "Map",
  icon: "map",
  match: () => false,
};
const MESSAGES: Tab = {
  href: "/app/messages",
  label: "Messages",
  icon: "message",
  match: (p) => p.startsWith("/app/messages"),
};
const ALERTS: Tab = {
  href: "/app/notifications",
  label: "Notifications",
  icon: "heart",
  match: (p) => p.startsWith("/app/notifications"),
};

export function AppNav({
  adminOrgId,
  unreadNotifications = 0,
  unreadMessages = 0,
  me,
}: {
  adminOrgId: string | null;
  unreadNotifications?: number;
  unreadMessages?: number;
  me: { id: string; name: string; avatarUrl: string | null };
}) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Close menus on navigation -- adjusted during render (React's
  // recommended pattern for "reset state when a prop changes").
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setAddOpen(false);
    setMoreOpen(false);
  }

  const badge = unreadNotifications > 9 ? "9+" : String(unreadNotifications);
  const msgBadge = unreadMessages > 9 ? "9+" : String(unreadMessages);
  const youActive = YOU.match(pathname);
  // The map lives at /app/explore?view=map; read the query client-side.
  const searchParams = useSearchParams();
  const onMap = pathname.startsWith("/app/explore") && searchParams.get("view") === "map";

  return (
    <>
      {/* ================= Phones: top bar ================= */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-page/90 px-4 backdrop-blur-xl md:hidden">
        <Logo href="/app" size={28} />
        <div className="-mr-2 flex items-center">
        <Link
          href={MAP.href}
          aria-label="Network map"
          className="flex h-10 w-10 items-center justify-center text-ink"
        >
          <Icon name="map" className="h-[26px] w-[26px]" />
        </Link>
        <Link
          href={ALERTS.href}
          aria-label={`Notifications${unreadNotifications ? `, ${badge} unread` : ""}`}
          className="relative flex h-10 w-10 items-center justify-center text-ink"
        >
          <Icon name="heart" className="h-[26px] w-[26px]" filled={ALERTS.match(pathname)} />
          {unreadNotifications > 0 && <Badge text={badge} className="right-0.5 top-0.5" />}
        </Link>
        <Link
          href={MESSAGES.href}
          aria-label={`Messages${unreadMessages ? `, ${msgBadge} unread` : ""}`}
          className="relative flex h-10 w-10 items-center justify-center text-ink"
        >
          <Icon name="message" className="h-[25px] w-[25px]" filled={MESSAGES.match(pathname)} />
          {unreadMessages > 0 && <Badge text={msgBadge} className="right-0.5 top-0.5" />}
        </Link>
        </div>
      </header>

      {/* ================= Phones: bottom tab bar (icons only) ================= */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="flex h-[52px] items-stretch justify-around">
          <BarLink tab={HOME} active={HOME.match(pathname)} />
          <BarLink tab={EXPLORE} active={EXPLORE.match(pathname)} />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add"
            aria-haspopup="dialog"
            className="flex flex-1 items-center justify-center text-ink"
          >
            <Icon name="add" className="h-[26px] w-[26px]" filled={addOpen} />
          </button>
          <BarLink tab={INTROS} active={INTROS.match(pathname)} />
          <Link
            href={YOU.href}
            aria-label="You"
            aria-current={youActive ? "page" : undefined}
            className="flex flex-1 items-center justify-center"
          >
            <YouAvatar me={me} active={youActive} />
          </Link>
        </div>
      </nav>

      {/* ================= Desktop: left rail =================
          72px icon rail on md/lg; 244px with labels on xl (Instagram's
          web layout). */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-page px-3 pb-5 pt-7 md:flex xl:w-[244px]"
      >
        <div className="mb-8 flex h-10 items-center px-1.5">
          <Link href="/app" aria-label="Vouchline home" className="xl:hidden">
            <LogoMark size={30} />
          </Link>
          <span className="hidden xl:block">
            <Logo href="/app" size={30} />
          </span>
        </div>

        <ul className="flex flex-1 flex-col gap-1">
          <li>
            <RailLink tab={HOME} active={HOME.match(pathname)} />
          </li>
          <li>
            <RailLink tab={EXPLORE} active={EXPLORE.match(pathname) && !onMap} />
          </li>
          <li>
            <RailLink tab={MAP} active={onMap} />
          </li>
          <li>
            <RailLink
              tab={ALERTS}
              active={ALERTS.match(pathname)}
              badge={unreadNotifications > 0 ? badge : undefined}
            />
          </li>
          <li>
            <RailLink
              tab={MESSAGES}
              active={MESSAGES.match(pathname)}
              badge={unreadMessages > 0 ? msgBadge : undefined}
            />
          </li>
          <li>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-haspopup="dialog"
              aria-label="Add"
              className={railItem(addOpen)}
            >
              <Icon name="add" className="h-[26px] w-[26px] shrink-0" filled={addOpen} />
              <span className="hidden xl:inline">Add</span>
            </button>
          </li>
          <li>
            <RailLink tab={INTROS} active={INTROS.match(pathname)} />
          </li>
          <li>
            <Link
              href={YOU.href}
              aria-label="You"
              aria-current={youActive ? "page" : undefined}
              className={railItem(youActive)}
            >
              <YouAvatar me={me} active={youActive} />
              <span className="hidden xl:inline">You</span>
            </Link>
          </li>
        </ul>

        {/* More: settings, admin, log out */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="More"
            className={railItem(moreOpen)}
          >
            <Icon name="menu" className="h-[26px] w-[26px] shrink-0" filled={moreOpen} />
            <span className="hidden xl:inline">More</span>
          </button>
          {moreOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-0 cursor-default"
                onClick={() => setMoreOpen(false)}
              />
              <div
                role="menu"
                className="absolute bottom-[calc(100%+8px)] left-0 z-10 w-64 overflow-hidden rounded-card border border-border bg-surface p-2 shadow-elevated"
              >
                <MenuLink href="/app/settings" icon="gear" label="Settings" />
                {adminOrgId && <MenuLink href={`/app/admin/${adminOrgId}`} icon="shield" label="Admin" />}
                <div className="my-1 h-px bg-border" />
                <form action={signOut}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-sm font-semibold text-body hover:bg-fill"
                  >
                    <Icon name="logout" className="h-5 w-5" />
                    Log out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </nav>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function railItem(active: boolean) {
  return `flex h-12 w-full items-center gap-4 rounded-input px-3 text-[15px] text-ink transition-colors hover:bg-fill ${
    active ? "font-bold" : "font-medium"
  }`;
}

function YouAvatar({ me, active }: { me: { id: string; name: string; avatarUrl: string | null }; active: boolean }) {
  return (
    <span className={`shrink-0 rounded-full p-[1.5px] ${active ? "bg-ink" : ""}`}>
      <span className="block rounded-full bg-page p-[1.5px]">
        <Avatar id={me.id} name={me.name} src={me.avatarUrl} size={24} />
      </span>
    </span>
  );
}

function RailLink({ tab, active, badge }: { tab: Tab; active: boolean; badge?: string }) {
  return (
    <Link href={tab.href} aria-current={active ? "page" : undefined} aria-label={tab.label} className={railItem(active)}>
      <span className="relative shrink-0">
        <Icon name={tab.icon} className="h-[26px] w-[26px]" filled={active} />
        {badge && <Badge text={badge} className="-right-2 -top-1.5" />}
      </span>
      <span className="hidden xl:inline">{tab.label}</span>
    </Link>
  );
}

function BarLink({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <Link
      href={tab.href}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className="flex flex-1 items-center justify-center text-ink"
    >
      <Icon name={tab.icon} className="h-[26px] w-[26px]" filled={active} />
    </Link>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-semibold text-body hover:bg-fill"
    >
      <Icon name={icon} className="h-5 w-5" />
      {label}
    </Link>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span
      className={`absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent-gold px-1 text-[11px] font-bold text-white ring-2 ring-page ${className}`}
    >
      {text}
    </span>
  );
}
