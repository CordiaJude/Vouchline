"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { input } from "@/app/components/ui/styles";
import { Icon } from "@/app/components/icons";

type College = { id: string; name: string; city: string | null; state: string | null };

// Searchable college dropdown backed by search_colleges() (the College
// Scorecard list, 0033). Posts `school_id` (when picked from the list)
// and `school_name` (always). "My school isn't listed" switches to a
// plain text field.
export function CollegePicker({
  label,
  required,
  defaultValue,
  onChange,
}: {
  label: string;
  required?: boolean;
  defaultValue?: { id: string | null; name: string } | null;
  onChange?: (name: string | null, id?: string | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<College[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<{ id: string | null; name: string } | null>(defaultValue ?? null);
  const [manual, setManual] = useState(!!defaultValue && !defaultValue.id);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const q = query.trim();
  useEffect(() => {
    if (picked || manual || q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await createClient().rpc("search_colleges", { q });
      if (!cancelled) {
        setResults((data ?? []) as College[]);
        setActive(0);
        setOpen(true);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, picked, manual]);

  function choose(c: College) {
    setPicked({ id: c.id, name: c.name });
    setOpen(false);
    setQuery("");
    onChange?.(c.name, c.id);
  }

  function clear() {
    setPicked(null);
    setManual(false);
    onChange?.(null, null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </span>

      {picked && !manual ? (
        <>
          <input type="hidden" name="school_id" value={picked.id ?? ""} />
          <input type="hidden" name="school_name" value={picked.name} />
          <div className="flex items-center gap-3 rounded-input border border-ink bg-surface px-4 py-3">
            <Icon name="check" className="h-4 w-4 shrink-0 text-success" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{picked.name}</span>
            <button type="button" onClick={clear} className="text-xs font-semibold text-link hover:underline">
              Change
            </button>
          </div>
        </>
      ) : manual ? (
        <>
          <input
            name="school_name"
            required={required}
            defaultValue={picked?.name ?? ""}
            placeholder="Your school's full name"
            maxLength={160}
            className={input}
            onChange={(e) => onChange?.(e.target.value || null)}
          />
          <button type="button" onClick={clear} className="self-start text-xs font-semibold text-link hover:underline">
            Search the list instead
          </button>
        </>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
            // Required while nothing is picked, so the step can't be skipped
            // with a half-typed name.
            required={required}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!open || results.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                choose(results[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Start typing your school's name"
            autoComplete="off"
            className={`${input} pl-11`}
          />
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          {open && q.length >= 2 && (
            <ul
              id={listId}
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-72 overflow-y-auto rounded-input border border-border bg-surface p-1 shadow-elevated"
            >
              {results.length === 0 && !loading ? (
                <li className="px-3 py-2.5 text-sm text-muted">No matches.</li>
              ) : (
                results.map((c, i) => (
                  <li
                    key={c.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(c);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`cursor-pointer rounded-[10px] px-3 py-2.5 ${i === active ? "bg-fill" : ""}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{c.name}</span>
                    {(c.city || c.state) && (
                      <span className="block text-xs text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</span>
                    )}
                  </li>
                ))
              )}
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setManual(true);
                    setOpen(false);
                    onChange?.(query.trim() || null);
                    setPicked(query.trim() ? { id: null, name: query.trim() } : null);
                  }}
                  className="w-full rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-link hover:bg-fill"
                >
                  My school isn&apos;t listed
                </button>
              </li>
            </ul>
          )}
          {q.length < 2 && (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="mt-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              Not in the U.S. or not listed? Type it instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
