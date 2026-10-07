import { brandIcon } from "@/lib/brand-icon";

// iPhone/iPad home-screen icon ("Add to Home Screen"). iOS rounds the
// corners itself, so the tile fills the square.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180, { bleed: true });
}
