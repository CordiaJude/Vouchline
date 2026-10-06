import Link from "next/link";
import { mutedText, link as linkStyle } from "@/app/components/ui/styles";

// A consistent shape for "there's nothing here yet" across the app,
// instead of every list improvising its own bare one-line <p>. Most
// empty states benefit from a next step, not just a statement of fact
// -- cta is optional for the handful of places where there's genuinely
// nothing to do (e.g. nothing waiting on you).
export function EmptyState({
  headline,
  detail,
  cta,
}: {
  headline: string;
  detail?: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-1 rounded-card border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">{headline}</p>
      {detail && <p className={`${mutedText} max-w-[22rem]`}>{detail}</p>}
      {cta && (
        <Link href={cta.href} className={`${linkStyle} mt-2 text-sm font-medium`}>
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
