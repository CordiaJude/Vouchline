import type { ReactNode } from "react";

export type AboutProfile = {
  headline: string | null;
  pledge_class: string | null;
  grad_year: number | null;
  employer: string | null;
  city: string | null;
  linkedin_url: string | null;
};

export function ProfileAbout({ profile }: { profile: AboutProfile }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {profile.grad_year && <Row label="Graduates" value={String(profile.grad_year)} />}
      {profile.employer && <Row label="Employer" value={profile.employer} />}
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
      {!profile.grad_year &&
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
