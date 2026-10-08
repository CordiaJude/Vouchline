// Where to send someone after onboarding. Only in-app paths are allowed,
// so a crafted link can't bounce people to another site.
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\/(app|c|invite|@)/.test(value) || value.startsWith("//") || value.includes("\\")) return undefined;
  return value.slice(0, 300);
}
