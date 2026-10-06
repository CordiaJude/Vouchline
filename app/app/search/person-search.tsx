"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REL_TYPES } from "@/app/components/rel-types";
import { PersonResultCard, type PersonResult } from "@/app/components/person-result-card";
import { input, mutedText } from "@/app/components/ui/styles";

type DiscoverResult = PersonResult;

const MIN_MUTUAL_OPTIONS = [0, 1, 2, 3, 5];

export function PersonSearch() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [minMutual, setMinMutual] = useState(0);
  const [results, setResults] = useState<DiscoverResult[]>([]);
  const [loading, setLoading] = useState(false);

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
      const { data } = await supabase.rpc("discover_search", {
        p_query: trimmedQuery,
        p_category: category || null,
        p_min_mutual: minMutual,
      });
      if (!cancelled) {
        setResults((data ?? []) as DiscoverResult[]);
        setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [trimmedQuery, category, minMutual]);

  const visibleResults = trimmedQuery.length < 2 ? [] : results;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="person-search" className="sr-only">
        Search by name, employer, or city
      </label>
      <input
        id="person-search"
        type="search"
        placeholder="Search by name, employer, or city"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={input}
      />

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by relationship category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${input} !w-auto`}
        >
          <option value="">Any category</option>
          {REL_TYPES.map((rel) => (
            <option key={rel.value} value={rel.value}>
              {rel.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Minimum mutual connections"
          value={minMutual}
          onChange={(e) => setMinMutual(Number(e.target.value))}
          className={`${input} !w-auto`}
        >
          {MIN_MUTUAL_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "Any mutuals" : `${n}+ mutuals`}
            </option>
          ))}
        </select>
      </div>

      {trimmedQuery.length < 2 && (
        <p className={mutedText}>Type at least 2 characters to search.</p>
      )}
      {loading && <p className={mutedText}>Searching…</p>}
      {trimmedQuery.length >= 2 && !loading && visibleResults.length === 0 && (
        <p className={mutedText}>No one matches yet.</p>
      )}

      {visibleResults.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visibleResults.map((r) => (
            <PersonResultCard key={r.id} result={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
