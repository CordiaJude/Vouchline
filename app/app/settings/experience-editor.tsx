"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CollegePicker } from "@/app/components/college-picker";
import { Icon } from "@/app/components/icons";
import { sortExperiences, type Experience } from "@/app/components/experience-list";
import { btnPrimarySmall, btnSecondarySmall, input } from "@/app/components/ui/styles";

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 6 - 1960 + 1 }, (_, i) => THIS_YEAR + 6 - i);

type Draft = {
  id?: string;
  kind: "work" | "education";
  title: string;
  organization: string;
  school_id: string | null;
  field: string;
  start_year: string;
  end_year: string;
  current: boolean;
  description: string;
};

const blank = (kind: "work" | "education"): Draft => ({
  kind,
  title: "",
  organization: "",
  school_id: null,
  field: "",
  start_year: "",
  end_year: "",
  current: kind === "work",
  description: "",
});

// Add / edit / remove jobs and schools. Writes straight to
// profile_experiences (owner-only RLS, 0044), then refreshes the page.
export function ExperienceEditor({ userId, experiences }: { userId: string; experiences: Experience[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save() {
    if (!draft) return;
    if (!draft.organization.trim()) {
      setError(draft.kind === "work" ? "Add the company." : "Add the school.");
      return;
    }
    setBusy(true);
    setError(null);
    const row = {
      user_id: userId,
      kind: draft.kind,
      title: draft.title.trim() || null,
      organization: draft.organization.trim(),
      school_id: draft.kind === "education" ? draft.school_id : null,
      field: draft.kind === "education" ? draft.field.trim() || null : null,
      start_year: draft.start_year ? Number(draft.start_year) : null,
      end_year: draft.current ? null : draft.end_year ? Number(draft.end_year) : null,
      description: draft.description.trim() || null,
    };
    const sb = createClient();
    const { error: err } = draft.id
      ? await sb.from("profile_experiences").update(row).eq("id", draft.id)
      : await sb.from("profile_experiences").insert(row);
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("too_many_entries")
          ? "That's the maximum number of entries."
          : err.message.includes("check")
            ? "Check the years: the end can't be before the start."
            : "Couldn't save. Try again.",
      );
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remove this entry?")) return;
    const { error: err } = await createClient().from("profile_experiences").delete().eq("id", id);
    if (err) setError("Couldn't remove it. Try again.");
    else router.refresh();
  }

  const sorted = sortExperiences(experiences);

  return (
    <div className="flex flex-col gap-3">
      {sorted.length === 0 && !draft && <p className="text-sm text-muted">Add where you&apos;ve worked and studied.</p>}
      <ul className="flex flex-col gap-2">
        {sorted.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-input border border-border bg-surface px-3 py-2.5">
            <Icon name={e.kind === "work" ? "building" : "school"} className="h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {e.kind === "work" ? [e.title, e.organization].filter(Boolean).join(" · ") : e.organization}
              </p>
              <p className="truncate text-xs text-muted">
                {[e.kind === "education" ? e.field : null, e.start_year, e.end_year ?? (e.start_year ? "Present" : null)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              type="button"
              aria-label="Edit"
              onClick={() =>
                setDraft({
                  id: e.id,
                  kind: e.kind,
                  title: e.title ?? "",
                  organization: e.organization,
                  school_id: e.school_id ?? null,
                  field: e.field ?? "",
                  start_year: e.start_year ? String(e.start_year) : "",
                  end_year: e.end_year ? String(e.end_year) : "",
                  current: !e.end_year && !!e.start_year,
                  description: e.description ?? "",
                })
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink"
            >
              <Icon name="pencil" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => remove(e.id)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-danger"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          {!draft.id && (
            <div className="grid grid-cols-2 gap-2">
              {(["work", "education"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDraft({ ...blank(k) })}
                  className={`h-10 rounded-input border text-sm font-semibold ${
                    draft.kind === k ? "border-ink bg-ink text-page" : "border-border-strong text-body"
                  }`}
                >
                  {k === "work" ? "Job" : "School"}
                </button>
              ))}
            </div>
          )}
          {draft.kind === "work" ? (
            <>
              <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={100} placeholder="Job title" className={input} />
              <input
                value={draft.organization}
                onChange={(e) => set("organization", e.target.value)}
                maxLength={160}
                placeholder="Company"
                className={input}
              />
            </>
          ) : (
            <>
              <CollegePicker
                key={draft.id ?? "new"}
                label="School"
                required
                defaultValue={draft.organization ? { id: draft.school_id, name: draft.organization } : null}
                onChange={(name, id) => setDraft((d) => (d ? { ...d, organization: name ?? "", school_id: id ?? null } : d))}
              />
              <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={100} placeholder="Degree (optional), e.g. B.S." className={input} />
              <input value={draft.field} onChange={(e) => set("field", e.target.value)} maxLength={100} placeholder="Field of study (optional)" className={input} />
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select value={draft.start_year} onChange={(e) => set("start_year", e.target.value)} className={input} aria-label="Start year">
              <option value="">Start year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={draft.current ? "" : draft.end_year}
              onChange={(e) => set("end_year", e.target.value)}
              disabled={draft.current}
              className={input}
              aria-label="End year"
            >
              <option value="">{draft.current ? "Present" : "End year"}</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={draft.current}
              onChange={(e) => set("current", e.target.checked)}
              className="h-4 w-4 accent-[var(--link)]"
            />
            {draft.kind === "work" ? "I currently work here" : "I currently study here"}
          </label>
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={600}
            rows={2}
            placeholder="What you did there (optional)"
            className={input}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className={btnPrimarySmall}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
              className={btnSecondarySmall}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(blank("work"))} className={btnSecondarySmall}>
            + Add job
          </button>
          <button type="button" onClick={() => setDraft(blank("education"))} className={btnSecondarySmall}>
            + Add school
          </button>
        </div>
      )}
      {error && !draft && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// Skills: type and press Enter (or comma) to add; tap x to remove.
export function SkillsEditor({ userId, skills }: { userId: string; skills: string[] }) {
  const router = useRouter();
  const [list, setList] = useState(skills);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function add(raw: string) {
    const s = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!s || list.some((x) => x.toLowerCase() === s.toLowerCase()) || list.length >= 30) return;
    setList((l) => [...l, s]);
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    const { error } = await createClient().from("profiles").update({ skills: list }).eq("id", userId);
    setStatus(error ? "error" : "saved");
    if (!error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface py-1 pl-3 pr-1 text-sm text-ink">
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => {
                setList((l) => l.filter((x) => x !== s));
                setStatus("idle");
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-ink"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            add(v.slice(0, -1));
            setText("");
          } else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
            setText("");
          }
        }}
        placeholder={list.length >= 30 ? "That's the maximum" : "Add a skill, e.g. Financial modeling"}
        disabled={list.length >= 30}
        className={input}
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={status === "saving"} className={btnPrimarySmall}>
          {status === "saving" ? "Saving…" : "Save skills"}
        </button>
        {status === "saved" && <span className="text-xs font-semibold text-success">Saved</span>}
        {status === "error" && <span className="text-xs text-danger">Couldn&apos;t save. Try again.</span>}
      </div>
    </div>
  );
}
