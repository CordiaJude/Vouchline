import { brandIcon } from "@/lib/brand-icon";

// Install icons referenced by app/manifest.ts:
//   /pwa-icon/192, /pwa-icon/512           -- rounded tile
//   /pwa-icon/maskable-192, /pwa-icon/maskable-512 -- full-bleed for Android
const SIZES = new Set([192, 512]);

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const maskable = size.startsWith("maskable-");
  const n = Number(maskable ? size.slice("maskable-".length) : size);
  if (!SIZES.has(n)) return new Response("Not found", { status: 404 });
  const res = brandIcon(n, { bleed: maskable });
  res.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return res;
}
