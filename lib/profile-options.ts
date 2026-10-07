// Options for the "what you do now" part of onboarding and settings.
// Stored as slugs/labels on profiles (see 0033_onboarding_profile_fields.sql).

export const STATUSES = [
  { value: "student", label: "I'm a student", detail: "In college right now" },
  { value: "working", label: "I'm working", detail: "Employed full- or part-time" },
  { value: "founder", label: "I run my own thing", detail: "Founder, owner, or self-employed" },
  { value: "looking", label: "I'm between roles", detail: "Looking for what's next" },
  { value: "other", label: "Something else", detail: "Retired, caregiving, taking a break…" },
] as const;
export type Status = (typeof STATUSES)[number]["value"];
export const isStatus = (v: unknown): v is Status => STATUSES.some((s) => s.value === v);

// Simplified from LinkedIn's top-level industries: broad enough that
// everyone fits, specific enough to match people.
export const INDUSTRIES = [
  "Technology",
  "Finance & Banking",
  "Investing & Venture Capital",
  "Real Estate",
  "Healthcare & Medicine",
  "Law",
  "Consulting",
  "Marketing & Advertising",
  "Sales",
  "Media & Entertainment",
  "Education",
  "Government & Public Policy",
  "Nonprofit",
  "Manufacturing",
  "Construction & Engineering",
  "Energy",
  "Retail & Consumer Goods",
  "Hospitality & Food",
  "Transportation & Logistics",
  "Automotive",
  "Sports & Fitness",
  "Other",
] as const;
export const isIndustry = (v: unknown): v is (typeof INDUSTRIES)[number] =>
  INDUSTRIES.includes(v as (typeof INDUSTRIES)[number]);

const THIS_YEAR = new Date().getFullYear();
// Students: this year through six years out. Alumni: back to 1960.
export const STUDENT_GRAD_YEARS = Array.from({ length: 7 }, (_, i) => THIS_YEAR + i);
export const ALUMNI_GRAD_YEARS = Array.from({ length: THIS_YEAR - 1960 + 1 }, (_, i) => THIS_YEAR - i);

// Default headline written from the answers, editable before saving.
// `work` matters for students, who can also have a job or internship.
export function suggestHeadline(a: {
  status: string | null;
  work?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  schoolName?: string | null;
  major?: string | null;
}): string {
  const at = (x?: string | null) => (x ? ` at ${x}` : "");
  const job =
    a.work === "founder"
      ? a.company
        ? `${a.jobTitle || "Founder"}${at(a.company)}`
        : a.jobTitle || "Founder"
      : a.jobTitle
        ? `${a.jobTitle}${at(a.company)}`
        : a.company
          ? `Working at ${a.company}`
          : "";
  switch (a.status) {
    case "student": {
      const school = a.major ? `${a.major} student${at(a.schoolName)}` : `Student${at(a.schoolName)}`;
      const hasJob = (a.work === "working" || a.work === "founder") && job;
      return (hasJob ? `${school} · ${job}` : school).slice(0, 120);
    }
    case "working":
    case "founder":
      return job;
    case "looking":
      return a.jobTitle ? `${a.jobTitle}, open to new roles` : "Open to new roles";
    default:
      return "";
  }
}
