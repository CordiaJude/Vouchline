// Per-device UI preference cookies (not security-relevant).
// "Your profile is X% complete" dismissed; set by dismissCompleteness().
export const HIDE_COMPLETENESS_COOKIE = "vl_hide_completeness";

// Settings -> Appearance: "dark" (default), "light", or "system".
export const THEME_COOKIE = "vl_theme";
export type Theme = "dark" | "light" | "system";
export const parseTheme = (v: string | undefined): Theme => (v === "light" || v === "system" ? v : "dark");

// Settings -> Appearance -> Color scheme.
export const PALETTE_COOKIE = "vl_palette";
export const PALETTES = ["midnight", "ember", "ocean", "coral"] as const;
export type Palette = (typeof PALETTES)[number];
export const parsePalette = (v: string | undefined): Palette =>
  (PALETTES as readonly string[]).includes(v ?? "") ? (v as Palette) : "midnight";

// Home's "Get started" checklist dismissed (per device).
export const HIDE_SETUP_COOKIE = "vl_hide_setup";
