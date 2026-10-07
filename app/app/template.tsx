import type { ReactNode } from "react";

// Re-mounts on every navigation inside the app, so each page gets a quick
// fade-in instead of an abrupt swap (see .page-enter in globals.css).
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
