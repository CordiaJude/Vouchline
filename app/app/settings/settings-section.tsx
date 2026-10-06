export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 border-t border-border pt-6">
      <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}
