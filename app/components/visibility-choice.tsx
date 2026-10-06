// "Who can see this connection?" -- asked every time someone connects
// (QR answer, connection request, confirming a pending request). Posts
// as `visibility` = "public" | "private"; the server action then calls
// set_connection_visibility for the caller's side only. A connection is
// shown to others only when BOTH people chose public.
export function VisibilityChoice({ name: personName }: { name?: string }) {
  const options = [
    {
      value: "public",
      title: "Public",
      detail: "Shows in the network orb, so people in your extended network can see you're connected.",
    },
    {
      value: "private",
      title: "Private",
      detail: `Only you${personName ? ` and ${personName}` : ""} can see this connection.`,
    },
  ];

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-ink">Who can see this connection?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-3 rounded-input border border-border-strong bg-surface p-3.5 transition-colors has-[:checked]:border-link has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name="visibility"
              value={o.value}
              defaultChecked={o.value === "public"}
              className="mt-1 h-4 w-4 accent-[var(--link)]"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{o.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        It only shows publicly if you both choose Public. You can change this later from your network.
      </p>
    </fieldset>
  );
}

export function parseVisibility(formData: FormData): boolean {
  return formData.get("visibility") !== "private";
}
