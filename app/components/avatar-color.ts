// Deterministic color from a user id, so the same person always gets the
// same initials-avatar background regardless of who's viewing or when.
// A small fixed hue palette (not a full 360-degree hash) keeps every
// generated color legible with white text on top, which an arbitrary
// hash-to-hue would not guarantee. The palette lives as real CSS classes
// in globals.css (avatar-bg-0..9, same order) since our CSP blocks inline
// style props -- this returns the class name, not a color value.
const PALETTE_SIZE = 10;

export function avatarColorClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return `avatar-bg-${Math.abs(hash) % PALETTE_SIZE}`;
}

export function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// Fill for places that can't use the avatar-bg-N classes (SVG in the
// network orb). Matches the single neutral style in globals.css.
export function avatarHex(id: string): string {
  void id;
  return "#2a2a2a";
}
