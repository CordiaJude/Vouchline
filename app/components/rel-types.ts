// The 10-category relationship taxonomy. Boss/coworker take the
// is_former modifier ("Former Boss"/"Former Coworker" in the UI) rather
// than being separate categories.
// Colors are tuned to the indigo/violet/pink brand palette but kept
// clearly separable from each other (distinct hue AND lightness steps,
// so neighbors stay distinguishable with common color-vision
// deficiencies), and mid-tone enough to read on light and dark canvases.
export const REL_TYPES: { value: string; label: string; color: string }[] = [
  { value: "family", label: "Family", color: "#F76707" },
  { value: "partner", label: "Partner", color: "#E03131" },
  { value: "best_friend", label: "Best Friend", color: "#D6336C" },
  { value: "friend", label: "Friend", color: "#F59F00" },
  { value: "mentor", label: "Mentor", color: "#7048E8" },
  { value: "boss", label: "Boss", color: "#1C7ED6" },
  { value: "coworker", label: "Coworker", color: "#12B886" },
  { value: "classmate", label: "Classmate", color: "#15AABF" },
  { value: "org_member", label: "Org/Chapter", color: "#74B816" },
  { value: "business_contact", label: "Business Contact", color: "#868E96" },
];

export const FORMER_ELIGIBLE = new Set(["boss", "coworker"]);

const LABELS: Record<string, string> = Object.fromEntries(
  REL_TYPES.map((r) => [r.value, r.label]),
);

export function relLabel(
  rel: string | null | undefined,
  isFormer?: boolean | null,
): string {
  if (!rel) return "—";
  const label = LABELS[rel] ?? rel;
  return isFormer && FORMER_ELIGIBLE.has(rel) ? `Former ${label}` : label;
}
