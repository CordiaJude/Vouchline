"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/app/components/icons";

// The center "Add" action: a bottom sheet on phones, a centered dialog
// on desktop. Every way to grow your network starts here.
export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function invite() {
    const url = `${window.location.origin}/signup`;
    const text = "Join me on Vouchline -- warm intros through people who actually know you.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Vouchline", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed -- nothing to do.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label="Add">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md rounded-t-[24px] border border-border bg-surface px-2 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 md:rounded-[24px] md:pb-2">
        <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-pill bg-border-strong md:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between px-4 py-2">
          <h2 className="text-base font-bold text-ink">Add to your network</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="hidden h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink md:flex">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <ul className="flex flex-col">
          <Option href="/app/connect" icon="qr" title="Show my code" detail="In person? They scan it with their phone camera." />
          <Option href="/app/explore?for=connect" icon="userPlus" title="Someone I know" detail="Find them and confirm how you know each other." />
          <Option href="/app/intros?tab=want&add=1" icon="target" title="Someone I want to meet" detail="Add them to your list and we'll find a path." />
          <li>
            <button type="button" onClick={invite} className="flex w-full items-center gap-4 rounded-input px-4 py-3 text-left hover:bg-fill">
              <OptionIcon name="share" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{copied ? "Link copied" : "Invite a friend"}</span>
                <span className="block text-xs text-muted">Send them a link to join.</span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Option({ href, icon, title, detail }: { href: string; icon: IconName; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 rounded-input px-4 py-3 hover:bg-fill">
        <OptionIcon name={icon} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-muted">{detail}</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 text-muted" />
      </Link>
    </li>
  );
}

function OptionIcon({ name }: { name: IconName }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-ink">
      <Icon name={name} className="h-[22px] w-[22px]" />
    </span>
  );
}
