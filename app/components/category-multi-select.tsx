"use client";

import { useState } from "react";
import { REL_TYPES, FORMER_ELIGIBLE } from "@/app/components/rel-types";

type Selection = { category: string; is_former: boolean; is_primary: boolean };

// Multi-select checkboxes + a "set as primary" toggle per checked
// category. Submits as a single hidden jsonb-shaped input rather than
// separate form fields, since the RPCs now take a whole category set at
// once (private.write_connection_categories validates it: 1-10 entries,
// no duplicates, exactly one primary).
export function CategoryMultiSelect({
  legendText,
  inputName = "categories_json",
}: {
  legendText: string;
  inputName?: string;
}) {
  const [selected, setSelected] = useState<Selection[]>([]);

  function toggle(category: string) {
    setSelected((prev) => {
      const exists = prev.some((c) => c.category === category);
      if (exists) {
        const next = prev.filter((c) => c.category !== category);
        const removedWasPrimary = prev.find((c) => c.category === category)?.is_primary;
        if (removedWasPrimary && next.length > 0) {
          next[0] = { ...next[0], is_primary: true };
        }
        return next;
      }
      return [...prev, { category, is_former: false, is_primary: prev.length === 0 }];
    });
  }

  function toggleFormer(category: string) {
    setSelected((prev) =>
      prev.map((c) => (c.category === category ? { ...c, is_former: !c.is_former } : c)),
    );
  }

  function setPrimary(category: string) {
    setSelected((prev) => prev.map((c) => ({ ...c, is_primary: c.category === category })));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-body">{legendText}</legend>
      {REL_TYPES.map((rel) => {
        const sel = selected.find((c) => c.category === rel.value);
        return (
          <div key={rel.value} className="flex flex-col gap-1">
            <label className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={!!sel}
                onChange={() => toggle(rel.value)}
                className="h-4 w-4"
              />
              {rel.label}
              {sel && (
                <button
                  type="button"
                  onClick={() => setPrimary(rel.value)}
                  className={
                    sel.is_primary
                      ? "ml-auto font-label text-xs font-medium text-link"
                      : "ml-auto font-label text-xs text-muted underline underline-offset-2"
                  }
                >
                  {sel.is_primary ? "★ Primary" : "Set as primary"}
                </button>
              )}
            </label>
            {sel && FORMER_ELIGIBLE.has(rel.value) && (
              <label className="ml-7 flex items-center gap-3 text-xs text-body">
                <input
                  type="checkbox"
                  checked={sel.is_former}
                  onChange={() => toggleFormer(rel.value)}
                  className="h-4 w-4 accent-accent"
                />
                This is a former {rel.label.toLowerCase()}
              </label>
            )}
          </div>
        );
      })}
      <input type="hidden" name={inputName} value={JSON.stringify(selected)} />
    </fieldset>
  );
}
