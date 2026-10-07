"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { btnPrimary, btnPrimarySmall, btnSecondary, btnSecondarySmall, input } from "@/app/components/ui/styles";

type Match = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  headline: string | null;
  connected: boolean;
  is_contact: boolean;
};

// Contact Picker API (Android Chrome); not in TypeScript's DOM lib yet.
type ContactsManager = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ email?: string[] }[]>;
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function extractEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
}

// Hash on the device: only SHA-256 hashes ever leave the browser.
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function FindFriends() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  // Known only in the browser; the server render assumes no picker.
  const hasPicker = useSyncExternalStore(
    () => () => {},
    () => "contacts" in navigator,
    () => false,
  );
  const contacts = hasPicker ? (navigator as Navigator & { contacts?: ContactsManager }).contacts : undefined;

  async function lookup(emails: string[]) {
    setError(null);
    if (emails.length === 0) {
      setError("We couldn't find any email addresses there.");
      return;
    }
    setBusy(true);
    const unique = emails.slice(0, 2000);
    const hashes = await Promise.all(unique.map(sha256));
    const { data, error: err } = await createClient().rpc("find_people_by_email_hashes", { p_hashes: hashes });
    setBusy(false);
    if (err) {
      setError(err.message.includes("rate_limited") ? "You've searched a lot this hour. Try again later." : "Something went wrong. Try again.");
      return;
    }
    setChecked(unique.length);
    setMatches((data ?? []) as Match[]);
  }

  async function pickContacts() {
    try {
      const picked = await contacts!.select(["email"], { multiple: true });
      await lookup([...new Set(picked.flatMap((c) => c.email ?? []).map((e) => e.toLowerCase()))]);
    } catch {
      // Picker dismissed.
    }
  }

  async function invite() {
    const url = `${window.location.origin}/signup`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on Vouchline", text: "Warm intros through people who actually know you.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // dismissed
    }
  }

  if (matches) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted">
          Checked {checked} {checked === 1 ? "email" : "emails"}.{" "}
          {matches.length === 0
            ? "None of them are on Vouchline yet."
            : `${matches.length} ${matches.length === 1 ? "is" : "are"} on Vouchline.`}
        </p>
        {matches.length > 0 && (
          <ul className="mt-4 flex flex-col">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Link href={`/app/u/${m.id}`}>
                  <Avatar id={m.id} name={m.full_name} src={m.avatar_url} size={48} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/app/u/${m.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                    {m.full_name}
                  </Link>
                  <p className="truncate text-xs text-muted">{m.headline ?? `@${m.username}`}</p>
                </div>
                {m.connected ? (
                  <span className="text-xs font-semibold text-muted">Connected</span>
                ) : (
                  <Link href={`/app/connect/request?person=${m.id}`} className={btnPrimarySmall}>
                    Connect
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={invite} className={btnPrimary}>
            {copied ? "Invite link copied" : "Invite friends who aren't here"}
          </button>
          <button type="button" onClick={() => setMatches(null)} className={btnSecondary}>
            Check more contacts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {contacts && (
        <button type="button" onClick={pickContacts} disabled={busy} className={`${btnPrimary} w-full`}>
          <Icon name="users" className="h-5 w-5" /> Choose from my contacts
        </button>
      )}

      <div className="rounded-card border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-ink">Upload your contacts</p>
        <p className="mt-0.5 text-xs text-muted">
          A .vcf or .csv file. On iPhone: Contacts → select all → Export. On Google: contacts.google.com → Export.
        </p>
        <label className={`${btnSecondarySmall} mt-3 cursor-pointer`}>
          {busy ? "Checking…" : "Choose file"}
          <input
            type="file"
            accept=".vcf,.csv,.txt,text/vcard,text/csv,text/plain"
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5_000_000) {
                setError("That file is too big. Try exporting just your contacts.");
                return;
              }
              await lookup(extractEmails(await file.text()));
            }}
          />
        </label>
      </div>

      <div className="rounded-card border border-border bg-surface p-4">
        <label htmlFor="paste-emails" className="text-sm font-semibold text-ink">
          Or paste email addresses
        </label>
        <textarea
          id="paste-emails"
          rows={3}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="maya@example.com, leo@example.com"
          className={`${input} mt-2`}
        />
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() => lookup(extractEmails(paste))}
          className={`${btnSecondarySmall} mt-3`}
        >
          {busy ? "Checking…" : "Find them"}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="flex items-start gap-2 text-xs text-muted">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
        Emails are scrambled on your device before anything is sent, and nothing you upload is saved. Only people who
        chose &ldquo;Let people find me&rdquo; can be found.
      </p>
    </div>
  );
}
