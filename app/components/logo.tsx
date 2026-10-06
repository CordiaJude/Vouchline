import Link from "next/link";

// Brand mark: a rounded tile in the Instagram-style gradient with a "V" made of two converging
// strokes (two people meeting at a vouch), plus the wordmark.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="bg-brand-gradient inline-flex shrink-0 items-center justify-center rounded-[30%]"
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <path
          d="M9 10.5l7 11 7-11"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="9" r="2.2" fill="#fff" />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", size = 32 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Vouchline home">
      <LogoMark size={size} />
      <span className="font-display text-lg font-extrabold tracking-tight text-ink">Vouchline</span>
    </Link>
  );
}
