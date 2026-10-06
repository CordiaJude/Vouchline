"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { input, cardOutlined, btnSecondary } from "@/app/components/ui/styles";
import { ClaimStubForm } from "./claim-form";

type SearchResult = {
  id: string;
  full_name: string;
  headline: string | null;
  employer: string | null;
  city: string | null;
};

export function ClaimSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showStubForm, setShowStubForm] = useState(false);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("search_members", { q: trimmedQuery });
      if (!cancelled) {
        setResults((data ?? []) as SearchResult[]);
        setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery]);

  if (showStubForm) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setShowStubForm(false)}
          className="self-start font-label text-sm font-medium text-link"
        >
          ← Back to search
        </button>
        <ClaimStubForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="claim-search" className="sr-only">
        Search for who you want to claim
      </label>
      <input
        id="claim-search"
        type="search"
        placeholder="Search by name, employer, or city"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={input}
      />

      {loading && <p className="text-xs text-muted">Searching…</p>}

      {trimmedQuery.length >= 2 && !loading && (
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/app/claim?person=${r.id}`} className={`${cardOutlined} block`}>
                <p className="text-sm font-medium text-ink">{r.full_name}</p>
                {(r.employer || r.city) && (
                  <p className="text-xs text-muted">
                    {[r.employer, r.city].filter(Boolean).join(" · ")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setShowStubForm(true)} className={btnSecondary}>
        Not on Vouchline yet? Claim them anyway
      </button>
    </div>
  );
}
