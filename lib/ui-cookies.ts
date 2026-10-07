// Per-device UI preference cookies (not security-relevant).
// "Your profile is X% complete" dismissed; set by dismissCompleteness().
export const HIDE_COMPLETENESS_COOKIE = "vl_hide_completeness";

// Settings -> Appearance: "dark" (default), "light", or "system".
export const THEME_COOKIE = "vl_theme";
export type Theme = "dark" | "light" | "system";
export const parseTheme = (v: string | undefined): Theme => (v === "light" || v === "system" ? v : "dark");
