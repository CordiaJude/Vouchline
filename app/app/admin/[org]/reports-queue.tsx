"use client";

import { useTransition } from "react";
import { resolveReport } from "./actions";

type Report = {
  id: string;
  reporter_name: string;
  reported_name: string;
  reason: string;
  created_at: string;
};

export function ReportsQueue({
  orgId,
  reports,
}: {
  orgId: string;
  reports: Report[];
}) {
  const [pending, startTransition] = useTransition();

  if (reports.length === 0) {
    return (
      <p className="mt-3 text-sm text-muted">
        No open reports.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {reports.map((r) => (
        <div
          key={r.id}
          className="rounded-card border border-border p-3"
        >
          <p className="text-sm text-ink">
            {r.reporter_name} reported {r.reported_name}
          </p>
          <p className="mt-1 text-xs text-muted">
            {r.reason}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() =>
                  resolveReport(orgId, r.id, "remove_member"),
                )
              }
              className="h-8 rounded-pill border border-danger/30 px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
            >
              Remove member
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => resolveReport(orgId, r.id, "dismiss"))
              }
              className="h-8 rounded-pill border border-border px-3 text-xs font-medium text-ink transition-colors hover:bg-fill"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
