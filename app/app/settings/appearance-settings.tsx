import { setPalette, setTheme } from "@/app/app/actions";
import type { Palette, Theme } from "@/lib/ui-cookies";

const OPTIONS: { value: Theme; label: string; detail: string }[] = [
  { value: "dark", label: "Dark", detail: "Black background" },
  { value: "light", label: "Light", detail: "White background" },
  { value: "system", label: "Match my device", detail: "Follows your phone or computer" },
];

const PALETTE_OPTIONS: { value: Palette; label: string; detail: string; swatch: string }[] = [
  { value: "midnight", label: "Midnight & gold", detail: "Navy and champagne gold", swatch: "swatch-midnight" },
  { value: "ember", label: "Sunset ember", detail: "Coral and amber", swatch: "swatch-ember" },
  { value: "ocean", label: "Ocean blue", detail: "Electric blue and sky", swatch: "swatch-ocean" },
  { value: "coral", label: "Coral & sky", detail: "Coral and sky blue", swatch: "swatch-coral" },
];

// Color scheme: four swatches, each submits on its own.
export function PaletteSettings({ current }: { current: Palette }) {
  return (
    <form action={setPalette} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PALETTE_OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="submit"
            name="palette"
            value={o.value}
            aria-pressed={active}
            className={`tab-press rounded-input border p-3 text-left transition-colors ${
              active ? "border-ink bg-fill" : "border-border-strong bg-surface hover:border-ink"
            }`}
          >
            <span className={`block h-8 w-full rounded-lg ${o.swatch}`} aria-hidden="true" />
            <span className="mt-2 block text-sm font-semibold text-ink">{o.label}</span>
            <span className="block text-xs text-muted">{o.detail}</span>
          </button>
        );
      })}
    </form>
  );
}

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
