// Vouchline design system (dark, Instagram-inspired): shared class strings for the handful of
// primitives every page uses. One rounded sans (Plus Jakarta Sans) for
// everything; hierarchy comes from weight and size, not a second family.
// Cards are near-black on a black page with a hairline edge (no
// shadows); primary actions are white pills with black labels; links
// are blue; the multi-color gradient is only for story rings and the
// logo (see globals.css).

export const heading1 =
  "font-display text-2xl font-bold tracking-tight text-ink md:text-[28px] md:leading-tight";
export const heading2 = "font-display text-lg font-bold tracking-tight text-ink";
export const eyebrow =
  "font-label text-[12px] font-semibold uppercase tracking-[0.12em] text-muted";
export const bodyText = "font-body text-sm leading-relaxed text-body";
export const mutedText = "font-body text-sm leading-relaxed text-muted";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-pill font-label font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary = `${btnBase} h-12 bg-accent px-6 text-sm text-on-accent shadow-accent hover:bg-accent-hover`;

export const btnSecondary = `${btnBase} h-12 border border-border bg-surface px-6 text-sm text-ink shadow-card hover:bg-fill`;

export const btnPrimarySmall = `${btnBase} h-9 bg-accent px-4 text-xs text-on-accent hover:bg-accent-hover`;

export const btnSecondarySmall = `${btnBase} h-9 border border-border bg-surface px-4 text-xs text-ink hover:bg-fill`;

export const btnDangerSmall = `${btnBase} h-9 border border-danger/40 bg-surface px-4 text-xs text-danger hover:bg-danger/10`;

export const pill =
  "inline-flex items-center gap-1.5 rounded-pill bg-fill px-3 py-1 font-label text-xs font-semibold text-body";
export const pillAccent =
  "inline-flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-1 font-label text-xs font-semibold text-ink";
export const pillGold =
  "inline-flex items-center gap-1.5 rounded-pill bg-accent-gold px-3 py-1 font-label text-xs font-semibold text-on-accent";

export const cardFilled = "rounded-card bg-fill p-5";
export const cardOutlined = "rounded-card border border-border bg-surface p-5 shadow-card";
export const cardFeatured =
  "relative overflow-hidden rounded-card border border-border-strong bg-surface p-5";

export const input =
  "w-full rounded-input border border-border-strong bg-surface px-4 py-3 font-body text-[15px] text-ink placeholder:text-muted transition-shadow focus:outline-none focus:border-link focus:ring-4 focus:ring-link/20";

export const link = "font-semibold text-link underline-offset-2 hover:underline";

export const pageShell =
  "flex min-h-screen flex-col items-center px-4 py-8 md:py-12";

// Filter chips and segmented tabs (network type filters, list/orb
// switch, intros tabs). Selected = solid ink, like a social app's
// active filter; unselected = quiet white pill.
export const chip =
  "inline-flex h-9 items-center gap-1.5 rounded-pill border border-border bg-surface px-4 font-label text-xs font-semibold text-body transition-colors hover:bg-fill";
export const chipActive =
  "inline-flex h-9 items-center gap-1.5 rounded-pill border border-ink bg-ink px-4 font-label text-xs font-semibold text-surface";
export const segmented = "inline-flex gap-1 rounded-pill bg-fill p-1";
export const segment =
  "inline-flex h-8 items-center rounded-pill px-4 font-label text-xs font-semibold text-muted transition-colors hover:text-ink";
export const segmentActive =
  "inline-flex h-8 items-center rounded-pill bg-surface px-4 font-label text-xs font-semibold text-ink shadow-card";

// Sign in / sign up / password screens: a centered elevated card on a
// soft glow, logo above.
export const authCard =
  "w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-elevated md:p-8";
