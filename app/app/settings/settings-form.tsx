"use client";

import { useActionState } from "react";
import { ProfileField } from "@/app/components/profile-field";
import { AvatarUpload } from "@/app/components/avatar-upload";
import { btnPrimary } from "@/app/components/ui/styles";
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
      <ProfileField
        label="Headline"
        name="headline"
        defaultValue={profile.headline ?? ""}
        error={fieldError("headline")}
      />
      <ProfileField
        label="Graduation year"
        name="grad_year"
        type="number"
        defaultValue={profile.grad_year ? String(profile.grad_year) : ""}
        error={fieldError("grad_year")}
      />
      <ProfileField
        label="Pledge class"
        name="pledge_class"
        defaultValue={profile.pledge_class ?? ""}
        error={fieldError("pledge_class")}
      />
      <ProfileField
        label="Employer"
        name="employer"
        defaultValue={profile.employer ?? ""}
        error={fieldError("employer")}
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
