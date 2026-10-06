"use client";

import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { input, btnPrimary, btnSecondary, cardOutlined } from "@/app/components/ui/styles";
import { addTargetAction, addTargetStubAction, type TargetActionState } from "./actions";

type SearchResult = {
  id: string;
  full_name: string;
  headline: string | null;
  employer: string | null;
  city: string | null;
};

const initialState: TargetActionState = {};

function AddTargetForm({ personId, personName }: { personId: string; personName: string }) {
  const [state, formAction, pending] = useActionState(
    addTargetAction.bind(null, personId),
    initialState,
  );

  if (state.success) {
    return (
      <p className="rounded-card bg-fill p-4 text-sm text-body">
        Added {personName.split(" ")[0]} to your target list.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="target-note" className="font-label text-sm font-medium text-body">
        Why {personName.split(" ")[0]}? (optional, private)
      </label>
      <textarea id="target-note" name="note" rows={2} maxLength={1000} className={input} />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : `Add ${personName.split(" ")[0]} to targets`}
      </button>
    </form>
  );
}

function AddStubForm() {
  const [state, formAction, pending] = useActionState(addTargetStubAction, initialState);

  if (state.success) {
    return (
      <p className="rounded-card bg-fill p-4 text-sm text-body">
        Added. If they sign up later with a matching LinkedIn, this target
        carries over to their real account automatically.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="target-name" className="font-label text-sm font-medium text-body">
        Their name
      </label>
      <input id="target-name" name="full_name" required className={input} />
      <label htmlFor="target-linkedin" className="font-label text-sm font-medium text-body">
        LinkedIn URL (optional)
      </label>
      <input
        id="target-linkedin"
        name="linkedin_url"
        type="url"
        placeholder="https://www.linkedin.com/in/them"
        className={input}
      />
      <label htmlFor="target-stub-note" className="font-label text-sm font-medium text-body">
        Why them? (optional, private)
      </label>
      <textarea id="target-stub-note" name="note" rows={2} maxLength={1000} className={input} />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Adding…" : "Add to targets"}
      </button>
    </form>
  );
}

export function AddTarget({
  prefill,
}: {
  prefill?: { id: string; full_name: string } | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(
    prefill ? { id: prefill.id, full_name: prefill.full_name, headline: null, employer: null, city: null } : null,
  );
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

  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="self-start font-label text-sm font-medium text-link"
        >
          ← Back to search
        </button>
        <AddTargetForm personId={selected.id} personName={selected.full_name} />
      </div>
    );
  }

  if (showStubForm) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowStubForm(false)}
          className="self-start font-label text-sm font-medium text-link"
        >
          ← Back to search
        </button>
        <AddStubForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="target-search" className="sr-only">
        Search for who you want to target
      </label>
      <input
        id="target-search"
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
              <button
                type="button"
                onClick={() => setSelected(r)}
                className={`${cardOutlined} block w-full text-left`}
              >
                <p className="text-sm font-medium text-ink">{r.full_name}</p>
                {(r.employer || r.city) && (
                  <p className="text-xs text-muted">
                    {[r.employer, r.city].filter(Boolean).join(" · ")}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setShowStubForm(true)} className={btnSecondary}>
        Not on Vouchline yet? Add them anyway
      </button>
    </div>
  );
}
