"use client";

import { useActionState, useRef, useState } from "react";
import { ProfileField } from "@/app/components/profile-field";
import { AvatarUpload } from "@/app/components/avatar-upload";
import { createProfile, type OnboardingState } from "./actions";
import { btnPrimary, btnSecondary } from "@/app/components/ui/styles";
import { INTEREST_GROUPS, GOALS } from "@/lib/interests";
import { ToggleChip } from "@/app/components/toggle-chip";

const initialState: OnboardingState = {};

const STEPS = [
  { title: "About you", subtitle: "Just enough for people to recognize you." },
  { title: "School", subtitle: "Helps us connect you with classmates." },
  { title: "What are you into?", subtitle: "We'll use this to suggest people you'll click with. Pick a few." },
  { title: "Finishing touches", subtitle: "All optional except the last box." },
] as const;

// Fields that live on step 1 -- if the server rejects one of these, jump
// back there so the error is visible.
const STEP1_FIELDS = ["full_name", "headline", "employer", "city"];
const STEP2_FIELDS = ["grad_year"];

export function OnboardingForm({
  userId,
  inviteToken,
  defaultFullName,
}: {
  userId: string;
  inviteToken?: string;
  defaultFullName?: string;
}) {
  const [state, formAction, pending] = useActionState(createProfile, initialState);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState(0);
  const [inCollege, setInCollege] = useState<"yes" | "no" | null>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Server-side validation failed on an earlier step's field: show it --
  // adjusted during render rather than in an effect.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    const bad = Object.keys(state.fieldErrors ?? {});
    if (bad.some((k) => STEP1_FIELDS.includes(k))) {
      setStep(0);
    } else if (bad.some((k) => STEP2_FIELDS.includes(k))) {
      setStep(1);
    }
  }

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  // Only advance when this step's own required fields are valid; the
  // browser can't focus an invalid field on a hidden step at submit time.
  function next() {
    const container = stepRefs.current[step];
    const fields = container?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? [];
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <form
      action={formAction}
      className="flex flex-col"
      onKeyDown={(e) => {
        // Enter on an early step means "continue", not "submit".
        if (e.key === "Enter" && step < STEPS.length - 1 && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          next();
        }
      }}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (t.name === "interests" || t.name === "goals") {
          setPicked(e.currentTarget.querySelectorAll('input[name="interests"]:checked, input[name="goals"]:checked').length);
        }
      }}
    >
      {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}
      {avatarUrl && <input type="hidden" name="avatar_url" value={avatarUrl} />}

      {/* Progress */}
      <div className="flex gap-1.5" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-pill ${i <= step ? "bg-ink" : "bg-fill"}`} />
        ))}
      </div>
      <p className="mt-5 text-xs font-semibold text-muted">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{STEPS[step].title}</h1>
      <p className="mt-1 text-sm text-muted">{STEPS[step].subtitle}</p>

      {state.formError && (
        <p className="mt-4 rounded-input bg-danger/10 p-3 text-sm text-danger">{state.formError}</p>
      )}

      {/* Step 1: about you */}
      <div
        ref={(el) => {
          stepRefs.current[0] = el;
        }}
        className={step === 0 ? "mt-6 flex flex-col gap-4" : "hidden"}
      >
        <AvatarUpload userId={userId} fullName={defaultFullName ?? ""} avatarUrl={null} onUploaded={setAvatarUrl} />
        <ProfileField
          label="Full name"
          name="full_name"
          defaultValue={defaultFullName}
          required
          error={fieldError("full_name")}
        />
        <ProfileField
          label="Headline"
          name="headline"
          placeholder="Product designer at Northwind"
          error={fieldError("headline")}
        />
        <ProfileField label="Where you work" name="employer" error={fieldError("employer")} />
        <ProfileField label="City" name="city" error={fieldError("city")} />
      </div>

      {/* Step 2: school -- graduation year only for current students */}
      <div
        ref={(el) => {
          stepRefs.current[1] = el;
        }}
        className={step === 1 ? "mt-6 flex flex-col gap-4" : "hidden"}
      >
        <fieldset>
          <legend className="text-sm font-bold text-ink">Are you in college?</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((v) => (
              <label
                key={v}
                className="flex h-12 cursor-pointer items-center justify-center rounded-input border border-border-strong bg-surface text-sm font-semibold text-body transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-page has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link"
              >
                <input
                  type="radio"
                  name="in_college"
                  value={v}
                  required
                  checked={inCollege === v}
                  onChange={() => setInCollege(v)}
                  className="sr-only"
                />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>
        {inCollege === "yes" && (
          <ProfileField
            label="When do you graduate?"
            name="grad_year"
            type="number"
            placeholder={String(new Date().getFullYear() + 2)}
            error={fieldError("grad_year")}
          />
        )}
      </div>

      {/* Step 3: interests + goals */}
      <div
        ref={(el) => {
          stepRefs.current[2] = el;
        }}
        className={step === 2 ? "mt-6 flex flex-col gap-6" : "hidden"}
      >
        {INTEREST_GROUPS.map((group) => (
          <fieldset key={group.title}>
            <legend className="text-sm font-bold text-ink">{group.title}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {group.items.map((item) => (
                <ToggleChip key={item.value} name="interests" value={item.value} label={item.label} />
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset>
          <legend className="text-sm font-bold text-ink">What do you want from Vouchline?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <ToggleChip key={g.value} name="goals" value={g.value} label={g.label} />
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">{picked === 0 ? "Nothing picked yet." : `${picked} picked.`}</p>
      </div>

      {/* Step 4: optional details + age */}
      <div
        ref={(el) => {
          stepRefs.current[3] = el;
        }}
        className={step === 3 ? "mt-6 flex flex-col gap-4" : "hidden"}
      >
        <ProfileField
          label="LinkedIn URL"
          name="linkedin_url"
          type="url"
          placeholder="https://www.linkedin.com/in/you"
          error={fieldError("linkedin_url")}
        />
        <label className="flex items-start gap-3 rounded-input border border-border bg-fill p-3.5 text-sm text-body">
          <input type="checkbox" name="is_public" defaultChecked className="mt-1 h-4 w-4 accent-[var(--link)]" />
          <span>
            <span className="block font-semibold text-ink">Let people find me</span>
            <span className="block text-xs text-muted">
              Anyone on Vouchline can find your profile by name and send you a request. Your connections stay
              private unless you mark them public. You can change this in Settings.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-body">
          <input type="checkbox" name="is_18_plus" required className="mt-1 h-4 w-4 accent-[var(--link)]" />
          <span>I confirm that I am 18 years of age or older.</span>
        </label>
        {fieldError("is_18_plus") && <p className="-mt-2 text-sm text-danger">{fieldError("is_18_plus")}</p>}
      </div>

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className={btnSecondary}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={`${btnPrimary} flex-1`}>
            {step === 2 && picked === 0 ? "Skip for now" : "Continue"}
          </button>
        ) : (
          <button type="submit" disabled={pending} className={`${btnPrimary} flex-1`}>
            {pending ? "Saving…" : "Finish and find people"}
          </button>
        )}
      </div>
    </form>
  );
}

