export type ProfileCompletenessFields = {
  headline: string | null;
  employer: string | null;
  city: string | null;
  grad_year: number | null;
  pledge_class: string | null;
  linkedin_url: string | null;
};

const COMPLETENESS_FIELDS: { key: keyof ProfileCompletenessFields; label: string }[] = [
  { key: "headline", label: "headline" },
  { key: "employer", label: "employer" },
  { key: "city", label: "city" },
  // grad_year only applies to students and pledge_class isn't asked
  // anymore, so neither counts toward "complete".
  { key: "linkedin_url", label: "LinkedIn" },
];

export function profileCompleteness(
  profile: ProfileCompletenessFields,
): { percent: number; nextMissingLabel: string } {
  const missing = COMPLETENESS_FIELDS.filter((f) => !profile[f.key]);
  const filled = COMPLETENESS_FIELDS.length - missing.length;
  const percent = Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
  return { percent, nextMissingLabel: missing[0]?.label ?? "" };
}
