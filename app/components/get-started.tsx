import Link from "next/link";
import { dismissSetup } from "@/app/app/actions";
import { Icon, type IconName } from "@/app/components/icons";

export type SetupStep = { key: string; label: string; detail: string; href: string; icon: IconName; done: boolean };

// "Get started" checklist on Home. Ticks off as you go, disappears when
// everything's done, and can be dismissed for good with the x.
export function GetStarted({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  const pct = done / steps.length;
  const C = 2 * Math.PI * 18;

  return (
    <section className="relative mt-6 overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-4 p-4 pr-12">
        {/* Progress ring (attributes, not inline styles: CSP) */}
        <svg viewBox="0 0 44 44" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--fill)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--link)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${C * pct} ${C}`}
          />
        </svg>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">Get started</h2>
          <p className="text-sm text-muted">
            {done} of {steps.length} done{next ? ` · next: ${next.label.toLowerCase()}` : ""}
          </p>
        </div>
      </div>
      <form action={dismissSetup} className="absolute right-2 top-2">
        <button
          type="submit"
          aria-label="Hide Get started"
          title="Hide"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </form>
      <ul className="border-t border-border">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fill ${s.done ? "opacity-60" : ""}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  s.done ? "bg-success text-page" : "bg-fill text-ink"
                }`}
              >
                <Icon name={s.done ? "check" : s.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold text-ink ${s.done ? "line-through" : ""}`}>{s.label}</span>
                {!s.done && <span className="block truncate text-xs text-muted">{s.detail}</span>}
              </span>
              {!s.done && <Icon name="chevronRight" className="h-4 w-4 text-muted" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
