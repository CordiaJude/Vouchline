"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { readResume, applyResume, type ResumeState, type ResumeSuggestions } from "./resume-actions";
import { Icon } from "@/app/components/icons";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";

const initial: ResumeState = {};
type FieldKey = "headline" | "job_title" | "employer" | "city" | "industry";
const FIELD_LABELS: Record<FieldKey, string> = {
  headline: "Headline",
  job_title: "Job title",
  employer: "Company",
  city: "City",
  industry: "Industry",
};

// Upload a resume / LinkedIn PDF -> review suggestions -> apply the ones you keep.
export function ResumeImport() {
  const [state, action, reading] = useActionState(readResume, initial);
  const [applying, startApply] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const s = state.suggestions;

  const toggle = (key: string) =>
    setSkip((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function apply(sug: ResumeSuggestions) {
    startApply(async () => {
      const fields: Partial<Record<FieldKey, string>> = {};
      for (const k of Object.keys(FIELD_LABELS) as FieldKey[]) {
        const v = sug[k];
        if (v && !skip.has(`f:${k}`)) fields[k] = v;
      }
      const r = await applyResume({
        fields,
        skills: skip.has("skills") ? [] : sug.skills,
        experiences: sug.experiences.filter((_, i) => !skip.has(`e:${i}`)),
      });
      setResult(r.error ?? "Added to your profile.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Upload your resume, or your LinkedIn profile as a PDF (on LinkedIn: your profile → More → Save to PDF). We&apos;ll
        suggest your details and you choose what to keep. The file isn&apos;t stored.
      </p>
      {!s && (
        <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            name="resume"
            accept="application/pdf"
            required
            className="text-sm text-body file:mr-3 file:rounded-pill file:border file:border-border-strong file:bg-surface file:px-4 file:py-2 file:text-xs file:font-semibold file:text-ink"
          />
          <button type="submit" disabled={reading} className={`${btnPrimarySmall} gap-1.5`}>
            <Icon name="sparkle" className="h-4 w-4" />
            {reading ? "Reading…" : "Read my resume"}
          </button>
        </form>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}

      {s && !result && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Here&apos;s what we found. Uncheck anything you don&apos;t want.</p>
          {(Object.keys(FIELD_LABELS) as FieldKey[])
            .filter((k) => s[k])
            .map((k) => (
              <Check key={k} on={!skip.has(`f:${k}`)} onToggle={() => toggle(`f:${k}`)}>
                <span className="text-muted">{FIELD_LABELS[k]}:</span> {s[k]}
              </Check>
            ))}
          {s.skills.length > 0 && (
            <Check on={!skip.has("skills")} onToggle={() => toggle("skills")}>
              <span className="text-muted">Skills:</span> {s.skills.join(", ")}
            </Check>
          )}
          {s.experiences.length > 0 && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-muted">History</p>}
          {s.experiences.map((e, i) => (
            <Check key={i} on={!skip.has(`e:${i}`)} onToggle={() => toggle(`e:${i}`)}>
              {[e.title, e.organization].filter(Boolean).join(" · ")}
              <span className="text-muted">
                {" "}
                {e.start_year ?? ""}
                {e.start_year || e.end_year ? "–" : ""}
                {e.end_year ?? (e.start_year ? "Present" : "")}
              </span>
            </Check>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => apply(s)} disabled={applying} className={btnPrimarySmall}>
              {applying ? "Adding…" : "Add to my profile"}
            </button>
            <button type="button" onClick={() => location.reload()} className={btnSecondarySmall}>
              Start over
            </button>
          </div>
        </div>
      )}
      {result && <p className={`text-sm ${result.startsWith("Added") ? "text-success" : "text-danger"}`}>{result}</p>}
    </div>
  );
}

function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
      <input type="checkbox" checked={on} onChange={onToggle} className="mt-1 h-4 w-4 accent-[var(--link)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
