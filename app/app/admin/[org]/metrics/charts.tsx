// Small, dependency-free chart primitives (plain SVG, no charting
// library) for the admin metrics page. Palette: a single sequential hue
// (the app's own --accent) for plain magnitude bars, and the dataviz
// skill's validated fixed status triplet (good/warning/critical) for
// anything that reads as a state rather than a bare quantity -- the
// brand's own accent/accent-gold/error trio failed the skill's
// colorblind-separation check when tried as a status palette, so this
// page uses the validated one instead, kept local to just these charts.
//
// Every dynamic width/color below is an SVG element attribute (width,
// fill), never a React `style` prop -- the app's CSP is
// `style-src 'self' 'nonce-...'` with no `unsafe-inline`, which silently
// drops inline `style="..."` attributes in every browser (confirmed by
// screenshotting an early version of this file: every bar rendered as an
// empty, colorless track). SVG attributes aren't CSS and aren't subject
// to style-src at all, so they render regardless.
const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
} as const;

const ACCENT = "#4a5a42";

function statusFor(actual: number, threshold: number): keyof typeof STATUS {
  if (threshold <= 0) return "good";
  const ratio = actual / threshold;
  if (ratio >= 1) return "good";
  if (ratio >= 0.75) return "warning";
  return "critical";
}

// Meter: fill carries severity vs a target; unfilled track is the
// surface fill token so state reads across the whole bar at a glance.
export function Meter({
  label,
  actual,
  threshold,
  unit = "%",
}: {
  label: string;
  actual: number;
  threshold: number;
  unit?: string;
}) {
  const status = statusFor(actual, threshold);
  const max = Math.max(actual, threshold, 1) * 1.1;
  const fillPct = Math.min(100, (actual / max) * 100);
  const targetPct = Math.min(100, (threshold / max) * 100);

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-3 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm text-body">{label}</span>
        <span className="text-sm font-medium text-ink">
          {actual}
          {unit}
          <span className="ml-1.5 text-xs font-normal text-muted">
            / {threshold}
            {unit} target
          </span>
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-pill bg-fill"
        title={`${actual}${unit} of ${threshold}${unit} target`}
      >
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width={fillPct} height="100" fill={STATUS[status]} />
          <rect x={Math.max(0, targetPct - 0.5)} y="0" width="1" height="100" fill="currentColor" opacity="0.3" />
        </svg>
      </div>
    </div>
  );
}

// BarList: single-hue horizontal bars for a small categorical breakdown
// (grad year, cohort). Direct-labeled since there are only a handful of
// rows -- reading every value off a shared axis wouldn't be faster.
export function BarList({
  rows,
}: {
  rows: { label: string; numerator: number; denominator: number }[];
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-muted">No data yet.</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {rows.map((r) => {
        const pct = r.denominator === 0 ? 0 : (r.numerator / r.denominator) * 100;
        const fillPct = Math.max(pct, pct > 0 ? 4 : 0);
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-body">{r.label}</span>
              <span className="text-muted">
                {r.numerator}/{r.denominator}
              </span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-pill bg-fill"
              title={`${r.label}: ${r.numerator} of ${r.denominator} (${Math.round(pct)}%)`}
            >
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="0" y="0" width={fillPct} height="100" fill={ACCENT} />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// StatusBar: one stacked horizontal bar for a 3-state composition
// (talked / no response / didn't talk). Status color is never the only
// signal -- an icon + label legend sits underneath, per the skill's
// mitigation for sub-3:1-contrast status hues on a light surface.
export function StatusBar({
  segments,
}: {
  segments: { label: string; value: number; status: keyof typeof STATUS }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className="mt-3 text-sm text-muted">No reported outcomes yet.</p>;
  }

  // 0.5-unit surface gaps between touching segments, in the same 0-100
  // coordinate space as the rect widths.
  const gap = 0.5;
  const rects = segments
    .filter((s) => s.value > 0)
    .reduce<{ label: string; value: number; status: keyof typeof STATUS; x: number; width: number }[]>(
      (acc, s) => {
        const priorEnd = acc.length === 0 ? 0 : acc[acc.length - 1].x + acc[acc.length - 1].width + gap;
        const width = (s.value / total) * 100;
        return [...acc, { ...s, x: priorEnd, width: Math.max(0, width - gap) }];
      },
      [],
    );

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="h-4 w-full overflow-hidden rounded-pill bg-fill">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          {rects.map((r) => (
            <rect key={r.label} x={r.x} y="0" width={r.width} height="100" fill={STATUS[r.status]}>
              <title>
                {r.label}: {r.value} ({Math.round((r.value / total) * 100)}%)
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs text-body">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <circle cx="5" cy="5" r="5" fill={STATUS[s.status]} />
            </svg>
            {s.label}: {s.value}
          </li>
        ))}
      </ul>
    </div>
  );
}
