"use client";

import { useActionState } from "react";
import { importRoster, type ImportState } from "./actions";

const initialState: ImportState = {};

export function CsvImportForm({ orgId }: { orgId: string }) {
  const [state, formAction, pending] = useActionState(
    importRoster.bind(null, orgId),
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <label
        htmlFor="csv"
        className="text-sm text-muted"
      >
        CSV with columns: full_name, email, grad_year, pledge_class
      </label>
      <input
        id="csv"
        name="csv"
        type="file"
        accept=".csv,text/csv"
        required
        className="text-sm text-ink"
      />
      {state.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}
      {typeof state.imported === "number" && (
        <p className="text-sm text-link">
          Invited {state.imported}, skipped {state.skipped} duplicate/invalid
          row{state.skipped === 1 ? "" : "s"}.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit rounded-pill bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Importing…" : "Import roster"}
      </button>
    </form>
  );
}
