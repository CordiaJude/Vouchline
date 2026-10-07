import { ImageResponse } from "next/og";

// The app icon, drawn in code so every size stays crisp: the Instagram-
// style gradient tile with the white "V" mark from the logo. `bleed`
// fills the whole square (Android "maskable" icons are cropped by the OS).
export function brandIcon(size: number, { bleed = false }: { bleed?: boolean } = {}) {
  const radius = bleed ? 0 : Math.round(size * 0.22);
  const mark = Math.round(size * (bleed ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius,
          background: "linear-gradient(45deg, #feda75 0%, #fa7e1e 25%, #d62976 50%, #962fbf 75%, #4f5bd5 100%)",
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32" fill="none">
          <path d="M9 10.5l7 11 7-11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="9" r="2.3" fill="#fff" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
