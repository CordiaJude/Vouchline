// Onboarding taxonomy: what people are into (interests) and what they
// want from the network (goals). Stored as slugs on profiles.interests /
// profiles.goals; suggest_people() ranks people by overlap. Adding a new
// option is safe; renaming a slug orphans everyone who picked it.

export const INTEREST_GROUPS: { title: string; items: { value: string; label: string }[] }[] = [
  {
    title: "Work & industry",
    items: [
      { value: "tech", label: "Tech" },
      { value: "startups", label: "Startups" },
      { value: "finance", label: "Finance" },
      { value: "investing", label: "Investing" },
      { value: "real_estate", label: "Real estate" },
      { value: "sales", label: "Sales" },
      { value: "marketing", label: "Marketing" },
      { value: "design", label: "Design" },
      { value: "healthcare", label: "Healthcare" },
      { value: "law", label: "Law" },
      { value: "education", label: "Education" },
      { value: "media", label: "Media" },
      { value: "automotive", label: "Automotive" },
      { value: "ai", label: "AI" },
    ],
  },
  {
    title: "Life & hobbies",
    items: [
      { value: "fitness", label: "Fitness" },
      { value: "sports", label: "Sports" },
      { value: "golf", label: "Golf" },
      { value: "outdoors", label: "Outdoors" },
      { value: "travel", label: "Travel" },
      { value: "food", label: "Food & drink" },
      { value: "music", label: "Music" },
      { value: "gaming", label: "Gaming" },
      { value: "art", label: "Art" },
      { value: "reading", label: "Reading" },
      { value: "faith", label: "Faith" },
      { value: "volunteering", label: "Volunteering" },
      { value: "parenting", label: "Parenting" },
      { value: "cars", label: "Cars" },
    ],
  },
];

export const GOALS: { value: string; label: string }[] = [
  { value: "grow_network", label: "Grow my network" },
  { value: "find_job", label: "Find a job" },
  { value: "hire", label: "Hire people" },
  { value: "find_clients", label: "Find clients" },
  { value: "raise_funding", label: "Raise funding" },
  { value: "find_mentor", label: "Find a mentor" },
  { value: "mentor_others", label: "Mentor others" },
  { value: "make_friends", label: "Make friends" },
  { value: "make_intros", label: "Introduce people I know" },
];

const ALL_INTERESTS = new Map(INTEREST_GROUPS.flatMap((g) => g.items).map((i) => [i.value, i.label]));
const ALL_GOALS = new Map(GOALS.map((g) => [g.value, g.label]));

export const interestLabel = (v: string) => ALL_INTERESTS.get(v) ?? v;
export const goalLabel = (v: string) => ALL_GOALS.get(v) ?? v;

export function cleanInterests(values: FormDataEntryValue[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && ALL_INTERESTS.has(v)))].slice(0, 20);
}
export function cleanGoals(values: FormDataEntryValue[]): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && ALL_GOALS.has(v)))].slice(0, 8);
}
