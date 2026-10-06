import Link from "next/link";

export function ProfileTabs({
  basePath,
  active,
  connectionsLabel,
}: {
  basePath: string;
  active: "about" | "connections";
  connectionsLabel: string;
}) {
  return (
    <div className="mt-6 flex gap-2 border-b border-border">
      <Tab href={basePath} active={active === "about"} label="About" />
      <Tab
        href={`${basePath}?tab=connections`}
        active={active === "connections"}
        label={connectionsLabel}
      />
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "border-b-2 border-accent px-1 pb-2 font-label text-sm font-semibold text-ink"
          : "border-b-2 border-transparent px-1 pb-2 font-label text-sm font-medium text-muted"
      }
    >
      {label}
    </Link>
  );
}
