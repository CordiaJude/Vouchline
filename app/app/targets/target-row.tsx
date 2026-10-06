"use client";

import Link from "next/link";
import { setTargetStage, removeTarget } from "./actions";
import { cardOutlined, mutedText, btnDangerSmall } from "@/app/components/ui/styles";

const STAGES = [
  { value: "watching", label: "Watching" },
  { value: "reaching_out", label: "Reaching out" },
  { value: "intro_requested", label: "Intro requested" },
  { value: "connected", label: "Connected" },
  { value: "closed", label: "Closed" },
] as const;

type Target = {
  id: string;
  target_id: string;
  full_name: string;
  headline: string | null;
  is_stub: boolean;
  stage: string;
  note: string | null;
};

export function TargetRow({ target }: { target: Target }) {
  return (
    <li className={cardOutlined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {target.is_stub ? (
            <p className="text-sm font-medium text-ink">
              {target.full_name}{" "}
              <span className="font-label text-[12px] uppercase tracking-wide text-muted">
                Not on Vouchline
              </span>
            </p>
          ) : (
            <Link href={`/app/u/${target.target_id}`} className="text-sm font-medium text-ink">
              {target.full_name}
            </Link>
          )}
          {target.headline && <p className={mutedText}>{target.headline}</p>}
        </div>
        <form action={removeTarget}>
          <input type="hidden" name="id" value={target.id} />
          <button type="submit" className={btnDangerSmall}>
            Remove
          </button>
        </form>
      </div>

      <form action={setTargetStage} className="mt-3 flex flex-col gap-1">
        <input type="hidden" name="id" value={target.id} />
        <label htmlFor={`stage-${target.id}`} className="sr-only">
          Pipeline stage
        </label>
        <select
          id={`stage-${target.id}`}
          name="stage"
          defaultValue={target.stage}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-9 w-full rounded-input border border-border-strong bg-surface px-3 font-label text-xs text-ink outline-none focus:border-link focus:ring-4 focus:ring-link/20"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </form>

      {target.note && <p className={`${mutedText} mt-2`}>{target.note}</p>}

      {!target.is_stub && (
        <Link
          href={`/app/search?target=${target.target_id}`}
          className="mt-2 inline-block font-label text-xs font-medium text-link"
        >
          Find a path →
        </Link>
      )}
    </li>
  );
}
