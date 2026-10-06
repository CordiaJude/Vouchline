// A checkbox styled as a selectable pill (interests, goals). Selected =
// solid, like a social app's active filter.
export function ToggleChip({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="inline-flex h-10 cursor-pointer select-none items-center rounded-pill border border-border-strong bg-surface px-4 text-sm font-semibold text-body transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-page has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="sr-only" />
      {label}
    </label>
  );
}
