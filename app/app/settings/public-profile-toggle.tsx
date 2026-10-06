"use client";

import { setPublicProfile } from "./actions";

export function PublicProfileToggle({ enabled }: { enabled: boolean }) {
  return (
    <form action={setPublicProfile} className="flex flex-col gap-2">
      <label className="flex items-start gap-3 text-sm text-body">
        <input
          type="checkbox"
          name="is_public"
          defaultChecked={enabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="mt-1 h-4 w-4"
        />
        <span>
          Make my profile public. Anyone on Vouchline can find you in
          Discover and send a connection request, even without a shared
          org.
        </span>
      </label>
    </form>
  );
}
