"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/app/components/avatar";
import { Icon } from "@/app/components/icons";
import { btnPrimary, btnPrimarySmall, btnSecondary, btnSecondarySmall, input } from "@/app/components/ui/styles";
import { extractEmails, extractPhones, normalizePhone, sha256 } from "@/lib/contacts";

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
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ email?: string[]; tel?: string[] }[]>;
};

type Found = { emails: string[]; phones: string[] };

// `onboarding`: shown as a signup step, with a Continue/Skip link.
export function FindFriends({ continueHref }: { continueHref?: string } = {}) {
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

  async function lookup({ emails, phones }: Found) {
    setError(null);
    if (emails.length === 0 && phones.length === 0) {
      setError("We couldn't find any phone numbers or email addresses there.");
      return;
    }
    setBusy(true);
    const e = emails.slice(0, 3000);
    const p = phones.slice(0, 3000);
    const [emailHashes, phoneHashes] = await Promise.all([Promise.all(e.map(sha256)), Promise.all(p.map(sha256))]);
    const { data, error: err } = await createClient().rpc("find_people_by_contact_hashes", {
      p_email_hashes: emailHashes,
      p_phone_hashes: phoneHashes,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("rate_limited") ? "You've searched a lot this hour. Try again later." : "Something went wrong. Try again.");
      return;
    }
    setChecked(new Set([...e, ...p]).size);
    setMatches((data ?? []) as Match[]);
  }

  async function pickContacts() {
    try {
      const props = ["email", "tel"];
      const picked = await contacts!.select(props, { multiple: true });
      await lookup({
        emails: [...new Set(picked.flatMap((c) => c.email ?? []).map((x) => x.toLowerCase()))],
        phones: [...new Set(picked.flatMap((c) => c.tel ?? []).map(normalizePhone).filter((x): x is string => !!x))],
      });
    } catch {
      // Picker dismissed.
    }
  }

  const fromText = (text: string): Found => ({ emails: extractEmails(text), phones: extractPhones(text) });

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
          Checked {checked} {checked === 1 ? "contact" : "contacts"}.{" "}
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
          {continueHref ? (
            <Link href={continueHref} className={btnSecondary}>
              Continue
            </Link>
          ) : (
            <button type="button" onClick={() => setMatches(null)} className={btnSecondary}>
              Check more contacts
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {contacts && (
        <button type="button" onClick={pickContacts} disabled={busy} className={`${btnPrimary} w-full`}>
          <Icon name="users" className="h-5 w-5" /> {busy ? "Checking…" : "Choose contacts"}
        </button>
      )}

      <div className="rounded-card border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-ink">{contacts ? "Or upload all your contacts" : "Upload all your contacts"}</p>
        <p className="mt-0.5 text-xs text-muted">
          On iPhone: open Contacts → Lists → press and hold &ldquo;All Contacts&rdquo; → Export, save it, then choose
          that file here. On Google: contacts.google.com → Export.
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
              await lookup(fromText(await file.text()));
            }}
          />
        </label>
      </div>

      <div className="rounded-card border border-border bg-surface p-4">
        <label htmlFor="paste-emails" className="text-sm font-semibold text-ink">
          Or paste phone numbers or emails
        </label>
        <textarea
          id="paste-emails"
          rows={3}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="(214) 555-0123, maya@example.com"
          className={`${input} mt-2`}
        />
        <button
          type="button"
          disabled={busy || !paste.trim()}
          onClick={() => lookup(fromText(paste))}
          className={`${btnSecondarySmall} mt-3`}
        >
          {busy ? "Checking…" : "Find them"}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="flex items-start gap-2 text-xs text-muted">
        <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
        Numbers and emails are scrambled on your device before anything is sent, and nothing you upload is saved. Only people who
        chose &ldquo;Let people find me&rdquo; can be found.
      </p>

      {continueHref && (
        <Link href={continueHref} className="self-center py-2 text-sm font-semibold text-muted hover:text-ink">
          Skip for now
        </Link>
      )}
    </div>
  );
}
