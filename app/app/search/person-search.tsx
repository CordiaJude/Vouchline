"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { REL_TYPES } from "@/app/components/rel-types";
import { PersonResultCard, type PersonResult } from "@/app/components/person-result-card";
import { CollegePicker } from "@/app/components/college-picker";
import { Icon } from "@/app/components/icons";
import { input, mutedText } from "@/app/components/ui/styles";
import { INDUSTRIES, ALUMNI_GRAD_YEARS, STUDENT_GRAD_YEARS } from "@/lib/profile-options";

const MIN_MUTUAL_OPTIONS = [0, 1, 2, 3, 5];
// Future grad years first (students), then past years (alumni).
const GRAD_YEARS = [...STUDENT_GRAD_YEARS.slice(1).reverse(), ...ALUMNI_GRAD_YEARS];

type Filters = {
  school: { id: string; name: string } | null;
  industry: string;
  city: string;
  gradYear: string;
  studentsOnly: boolean;
  category: string;
  minMutual: number;
};
const EMPTY: Filters = {
  school: null,
  industry: "",
  city: "",
  gradYear: "",
  studentsOnly: false,
  category: "",
  minMutual: 0,
};

// Search by name/employer/city/school/title, or browse with filters only
// ("everyone from Baylor in Finance"). Backed by discover_people (0036).
export function PersonSearch() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  // A failed search used to look exactly like "no matches".
  const [failure, setFailure] = useState<string | null>(null);
  // Remount the school picker when filters are cleared.
  const [pickerKey, setPickerKey] = useState(0);

  const q = query.trim();
  const activeCount =
    (filters.school ? 1 : 0) +
    (filters.industry ? 1 : 0) +
    (filters.city.trim() ? 1 : 0) +
    (filters.gradYear ? 1 : 0) +
    (filters.studentsOnly ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.minMutual ? 1 : 0);
  const searching = q.length >= 2 || activeCount > 0;

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await createClient().rpc("discover_people", {
        p_query: q,
        p_category: filters.category || null,
        p_min_mutual: filters.minMutual,
        p_school: filters.school?.id ?? null,
        p_industry: filters.industry || null,
        p_city: filters.city.trim() || null,
        p_grad_year: filters.gradYear ? Number(filters.gradYear) : null,
        p_students_only: filters.studentsOnly,
      });
      if (!cancelled) {
        if (error) console.error("discover_people failed", error);
        setFailure(
          error
            ? error.message.includes("rate_limited")
              ? "You're searching very fast. Wait a few seconds."
              : `Search isn't working right now (${error.code ?? "error"}: ${error.message})`
            : null,
        );
        setResults((data ?? []) as PersonResult[]);
        setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, filters, searching]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const visible = searching ? results : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="person-search" className="sr-only">
            Search people
          </label>
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id="person-search"
            type="search"
            placeholder="Search name, company, school, city…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${input} pl-11`}
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`inline-flex shrink-0 items-center gap-2 rounded-input border px-4 text-sm font-semibold transition-colors ${
            activeCount > 0 ? "border-ink bg-ink text-page" : "border-border-strong bg-surface text-ink hover:bg-fill"
          }`}
        >
          Filters
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-page px-1 text-[11px] font-bold text-ink">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <CollegePicker
              key={pickerKey}
              label="School"
              defaultValue={filters.school}
              onChange={(name, id) => set("school", name && id ? { id, name } : null)}
            />
          </div>
          <FilterSelect label="Industry" value={filters.industry} onChange={(v) => set("industry", v)}>
            <option value="">Any industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </FilterSelect>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="filter-city" className="text-sm font-semibold text-ink">
              City
            </label>
            <input
              id="filter-city"
              value={filters.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Any city"
              className={input}
            />
          </div>
          <FilterSelect label="Graduation year" value={filters.gradYear} onChange={(v) => set("gradYear", v)}>
            <option value="">Any year</option>
            {GRAD_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="How you know them" value={filters.category} onChange={(v) => set("category", v)}>
            <option value="">Anyone</option>
            {REL_TYPES.map((rel) => (
              <option key={rel.value} value={rel.value}>
                {rel.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Mutual connections"
            value={String(filters.minMutual)}
            onChange={(v) => set("minMutual", Number(v))}
          >
            {MIN_MUTUAL_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Any" : `${n}+ mutual`}
              </option>
            ))}
          </FilterSelect>
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-input border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-ink has-[:checked]:border-ink">
            <input
              type="checkbox"
              checked={filters.studentsOnly}
              onChange={(e) => set("studentsOnly", e.target.checked)}
              className="h-4 w-4 accent-[var(--link)]"
            />
            Students only
          </label>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY);
                setPickerKey((k) => k + 1);
              }}
              className="text-left text-sm font-semibold text-link hover:underline sm:col-span-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {!searching && <p className={mutedText}>Type at least 2 characters, or use Filters to browse.</p>}
      {searching && loading && <p className={mutedText}>Searching…</p>}
      {searching && !loading && failure && <p className="text-sm text-danger">{failure}</p>}
      {searching && !loading && !failure && visible.length === 0 && <p className={mutedText}>No one matches yet.</p>}

      {visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((r) => (
            <PersonResultCard key={r.id} result={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = `filter-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {children}
      </select>
    </div>
  );
}
