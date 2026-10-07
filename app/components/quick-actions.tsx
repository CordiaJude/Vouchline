import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/app/components/icons";

type Action = { href: string; label: string; detail: string; icon?: IconName; art?: ReactNode; badge?: number };

// Big, thumb-friendly shortcuts for the things people come to do.
export function QuickActions({ actions }: { actions: Action[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {actions.map((a) => (
        <li key={a.href}>
          <Link
            href={a.href}
            className="tab-press group relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-ink">
              {a.art ?? (a.icon && <Icon name={a.icon} className="h-5 w-5" />)}
            </span>
            {!!a.badge && (
              <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-gold px-1.5 text-[11px] font-bold text-white">
                {a.badge > 9 ? "9+" : a.badge}
              </span>
            )}
            <span>
              <span className="block text-sm font-bold text-ink">{a.label}</span>
              <span className="block text-xs text-muted">{a.detail}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
