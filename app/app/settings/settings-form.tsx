"use client";

import { useActionState } from "react";
import { ProfileField } from "@/app/components/profile-field";
import { AvatarUpload } from "@/app/components/avatar-upload";
import { CollegePicker } from "@/app/components/college-picker";
import { UsernameField } from "./username-field";
import { INDUSTRIES, STATUSES } from "@/lib/profile-options";
import { btnPrimary, input } from "@/app/components/ui/styles";
import { updateProfile, type SettingsState } from "./actions";

type ProfileDefaults = {
  id: string;
  full_name: string;
  headline: string | null;
  grad_year: number | null;
  pledge_class: string | null;
  employer: string | null;
  city: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  username: string;
  status: string | null;
  job_title: string | null;
  industry: string | null;
  school_id: string | null;
  school_name: string | null;
  major: string | null;
};

const initialState: SettingsState = {};

export function SettingsForm({ profile }: { profile: ProfileDefaults }) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AvatarUpload
        userId={profile.id}
        fullName={profile.full_name}
        avatarUrl={profile.avatar_url}
      />

      <ProfileField
        label="Full name"
        name="full_name"
        required
        defaultValue={profile.full_name}
        error={fieldError("full_name")}
      />
      <UsernameField current={profile.username} error={fieldError("username")} />
      <ProfileField
        label="Headline"
        name="headline"
        defaultValue={profile.headline ?? ""}
        error={fieldError("headline")}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-sm font-semibold text-ink">
          What you do now
        </label>
        <select id="status" name="status" defaultValue={profile.status ?? ""} className={input}>
          <option value="">Prefer not to say</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label.replace(/^I'm |^I /, "").replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>
      <ProfileField
        label="Job title"
        name="job_title"
        defaultValue={profile.job_title ?? ""}
        error={fieldError("job_title")}
      />
      <ProfileField
        label="Company"
        name="employer"
        defaultValue={profile.employer ?? ""}
        error={fieldError("employer")}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry" className="text-sm font-semibold text-ink">
          Industry
        </label>
        <select id="industry" name="industry" defaultValue={profile.industry ?? ""} className={input}>
          <option value="">Not set</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </div>
      <CollegePicker
        label="School"
        defaultValue={profile.school_name ? { id: profile.school_id, name: profile.school_name } : null}
      />
      <ProfileField
        label="Major"
        name="major"
        defaultValue={profile.major ?? ""}
        error={fieldError("major")}
      />
      <ProfileField
        label="Graduation year"
        name="grad_year"
        type="number"
        defaultValue={profile.grad_year ? String(profile.grad_year) : ""}
        error={fieldError("grad_year")}
      />
      <ProfileField
        label="City"
        name="city"
        defaultValue={profile.city ?? ""}
        error={fieldError("city")}
      />
      <ProfileField
        label="LinkedIn URL"
        name="linkedin_url"
        type="url"
        defaultValue={profile.linkedin_url ?? ""}
        error={fieldError("linkedin_url")}
      />

      {state.formError && (
        <p className="text-sm text-danger">
          {state.formError}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-link">
          Saved.
        </p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimary} mt-2 w-full`}>
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
