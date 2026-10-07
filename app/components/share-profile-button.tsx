"use client";

import { useState } from "react";
import { btnSecondarySmall } from "@/app/components/ui/styles";

// Shares vouchline.com/@username: the phone's share sheet where available,
// otherwise copies the link.
export function ShareProfileButton({ username, name, className }: { username: string; name: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className ?? btnSecondarySmall}
      onClick={async () => {
        const url = `${window.location.origin}/@${username}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: `${name} on Vouchline`, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Share sheet dismissed.
        }
      }}
    >
      {copied ? "Link copied" : "Share profile"}
    </button>
  );
}
