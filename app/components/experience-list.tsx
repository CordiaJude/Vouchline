import { Icon } from "@/app/components/icons";

export type Experience = {
  id: string;
  kind: "work" | "education";
  title: string | null;
  organization: string;
  school_id?: string | null;
  field: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
};

function years(e: Experience): string {
  if (!e.start_year && !e.end_year) return "";
  if (e.start_year && !e.end_year) return `${e.start_year} – Present`;
  if (!e.start_year) return String(e.end_year);
  return e.start_year === e.end_year ? String(e.start_year) : `${e.start_year} – ${e.end_year}`;
}

// Newest first: current roles, then by end year, then start year.
export function sortExperiences(list: Experience[]): Experience[] {
  return [...list].sort(
    (a, b) =>
      (b.end_year ?? 9999) - (a.end_year ?? 9999) || (b.start_year ?? 0) - (a.start_year ?? 0),
  );
}

// Experience / Education / Skills, LinkedIn-style, for profile pages.
export function ExperienceList({ experiences, skills }: { experiences: Experience[]; skills: string[] }) {
  const work = sortExperiences(experiences.filter((e) => e.kind === "work"));
  const edu = sortExperiences(experiences.filter((e) => e.kind === "education"));
  if (work.length === 0 && edu.length === 0 && skills.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col gap-8">
      {work.length > 0 && <Section title="Experience" icon="building" items={work} />}
      {edu.length > 0 && <Section title="Education" icon="school" items={edu} />}
      {skills.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-ink">Skills</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {skills.map((s) => (
              <li key={s} className="rounded-pill border border-border bg-surface px-3 py-1 text-sm text-ink">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Section({ title, icon, items }: { title: string; icon: "building" | "school"; items: Experience[] }) {
  return (
    <section>
      <h2 className="text-base font-bold text-ink">{title}</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {items.map((e) => (
          <li key={e.id} className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input bg-fill text-ink">
              <Icon name={icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                {e.kind === "work" ? e.title || e.organization : e.organization}
              </p>
              <p className="text-sm text-body">
                {e.kind === "work"
                  ? e.title
                    ? e.organization
                    : ""
                  : [e.title, e.field].filter(Boolean).join(", ")}
              </p>
              {years(e) && <p className="text-xs text-muted">{years(e)}</p>}
              {e.description && <p className="mt-1 whitespace-pre-wrap text-sm text-body">{e.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
