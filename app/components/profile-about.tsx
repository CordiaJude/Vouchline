import type { ReactNode } from "react";

export type AboutProfile = {
  headline: string | null;
  pledge_class: string | null;
  grad_year: number | null;
  employer: string | null;
  city: string | null;
  linkedin_url: string | null;
  job_title?: string | null;
  industry?: string | null;
  school_name?: string | null;
  major?: string | null;
  status?: string | null;
};

export function ProfileAbout({ profile }: { profile: AboutProfile }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {(profile.job_title || profile.employer) && (
        <Row
          label="Work"
          value={[profile.job_title, profile.employer].filter(Boolean).join(" at ")}
        />
      )}
      {profile.industry && <Row label="Industry" value={profile.industry} />}
      {profile.school_name && (
        <Row
          label={profile.status === "student" ? "School" : "Education"}
          value={[
            profile.school_name,
            profile.major,
            profile.grad_year ? `${profile.status === "student" ? "Class of " : ""}${profile.grad_year}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      {profile.city && <Row label="City" value={profile.city} />}
      {profile.linkedin_url && (
        <Row
          label="LinkedIn"
          value={
            <a
              href={profile.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline underline-offset-2 hover:text-link-hover"
            >
              {profile.linkedin_url}
            </a>
          }
        />
      )}
      {!profile.school_name &&
        !profile.job_title &&
        !profile.employer &&
        !profile.city &&
        !profile.linkedin_url && <p className="text-muted">Nothing added yet.</p>}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-label text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
