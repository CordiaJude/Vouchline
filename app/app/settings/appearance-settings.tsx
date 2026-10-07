import { setTheme } from "@/app/app/actions";
import type { Theme } from "@/lib/ui-cookies";

const OPTIONS: { value: Theme; label: string; detail: string }[] = [
  { value: "dark", label: "Dark", detail: "Black background" },
  { value: "light", label: "Light", detail: "White background" },
  { value: "system", label: "Match my device", detail: "Follows your phone or computer" },
];

// Three buttons; each submits on its own (works without JavaScript).
export function AppearanceSettings({ current }: { current: Theme }) {
  return (
    <form action={setTheme} className="grid gap-2 sm:grid-cols-3">
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="submit"
            name="theme"
            value={o.value}
            aria-pressed={active}
            className={`rounded-input border p-3 text-left transition-colors ${
              active ? "border-ink bg-fill" : "border-border-strong bg-surface hover:border-ink"
            }`}
          >
            <span className="block text-sm font-semibold text-ink">{o.label}</span>
            <span className="block text-xs text-muted">{o.detail}</span>
          </button>
        );
      })}
    </form>
  );
}
