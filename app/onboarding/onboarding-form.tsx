"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { ProfileField } from "@/app/components/profile-field";
import { AvatarUpload } from "@/app/components/avatar-upload";
import { CollegePicker } from "@/app/components/college-picker";
import { ToggleChip } from "@/app/components/toggle-chip";
import { createProfile, type OnboardingState } from "./actions";
import { btnPrimary, btnSecondary, input } from "@/app/components/ui/styles";
import { INTEREST_GROUPS, GOALS } from "@/lib/interests";
import {
  INDUSTRIES,
  STUDENT_GRAD_YEARS,
  ALUMNI_GRAD_YEARS,
  suggestHeadline,
  type Status,
} from "@/lib/profile-options";

type Work = "working" | "founder" | "looking" | "other" | "none";

const initialState: OnboardingState = {};

// Five short steps. Every question powers something -- search, intro
// paths, or "Suggested for you" -- and anything not essential is
// optional (each extra required field costs signups).
const STEPS = [
  { title: "Let's set up your profile", subtitle: "This is how people will recognize you." },
  { title: "What do you do?", subtitle: "So we can connect you with the right people." },
  { title: "What brings you here?", subtitle: "Pick everything that applies. We match people on this." },
  { title: "What are you into?", subtitle: "Optional, but it makes your suggestions much better." },
  { title: "Last step", subtitle: "Here's your headline. Change anything you like." },
] as const;

// Server-side validation errors jump back to the step that owns the field.
const FIELD_STEP: Record<string, number> = {
  full_name: 0,
  city: 0,
  status: 1,
  job_title: 1,
  employer: 1,
  industry: 1,
  school_name: 1,
  school_id: 1,
  major: 1,
  grad_year: 1,
  headline: 4,
  linkedin_url: 4,
};

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
  const [stepError, setStepError] = useState<string | null>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Answers that change later questions or the suggested headline.
  // Two independent answers: students can also work.
  const [student, setStudent] = useState<"yes" | "no" | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  // Stored profile status: "student" wins when both apply; job fields are
  // saved either way.
  const status: Status | null =
    student === "yes" ? "student" : student === "no" && work ? (work === "none" ? "other" : work) : null;
  const [wentToCollege, setWentToCollege] = useState<"yes" | "no" | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [major, setMajor] = useState("");
  const [goalCount, setGoalCount] = useState(0);
  const [interestCount, setInterestCount] = useState(0);
  const [headline, setHeadline] = useState("");
  const [headlineEdited, setHeadlineEdited] = useState(false);

  // Jump to the step with a server-side error -- adjusted during render.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    const steps = Object.keys(state.fieldErrors ?? {}).map((k) => FIELD_STEP[k] ?? 0);
    if (steps.length) setStep(Math.min(...steps));
  }

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];
  const register = (i: number, el: HTMLDivElement | null) => {
    stepRefs.current[i] = el;
  };
  const isStudent = student === "yes";
  const hasJob = work === "working" || work === "founder";
  const workOptions: { value: Work; label: string }[] = isStudent
    ? [
        { value: "working", label: "I have a job or internship" },
        { value: "founder", label: "I run my own thing" },
        { value: "none", label: "Not working right now" },
      ]
    : [
        { value: "working", label: "I'm working" },
        { value: "founder", label: "I run my own thing" },
        { value: "looking", label: "I'm between roles" },
        { value: "other", label: "Something else (retired, caregiving…)" },
      ];

  function next() {
    setStepError(null);
    const container = stepRefs.current[step];
    const fields = container?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? [];
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        return;
      }
    }
    if (step === 1 && (!student || !work)) {
      setStepError(!student ? "Let us know if you're a student." : "Pick the option that fits your work best.");
      return;
    }
    if (step === 2 && goalCount === 0) {
      setStepError("Pick at least one. It's how we know who to introduce you to.");
      return;
    }
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    if (nextStep === 4 && !headlineEdited) {
      setHeadline(suggestHeadline({ status, work, jobTitle, company, schoolName, major }));
    }
    setStep(nextStep);
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
        const form = e.currentTarget;
        const name = (e.target as unknown as HTMLInputElement).name;
        if (name === "goals") setGoalCount(form.querySelectorAll('input[name="goals"]:checked').length);
        if (name === "interests") setInterestCount(form.querySelectorAll('input[name="interests"]:checked').length);
      }}
    >
      {inviteToken && <input type="hidden" name="invite_token" value={inviteToken} />}
      {avatarUrl && <input type="hidden" name="avatar_url" value={avatarUrl} />}
      {status && <input type="hidden" name="status" value={status} />}

      {/* Progress */}
      <div className="flex gap-1.5" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-pill transition-colors ${i <= step ? "bg-ink" : "bg-fill"}`} />
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

      {/* ===== 1. You ===== */}
      <Step i={0} step={step} register={register}>
        <AvatarUpload userId={userId} fullName={defaultFullName ?? ""} avatarUrl={null} onUploaded={setAvatarUrl} />
        <ProfileField label="Full name" name="full_name" defaultValue={defaultFullName} required error={fieldError("full_name")} />
        <ProfileField label="City" name="city" placeholder="Dallas, TX" required error={fieldError("city")} />
      </Step>

      {/* ===== 2. What you do ===== */}
      <Step i={1} step={step} register={register}>
        <YesNo
          legend="Are you a student?"
          name="student_choice"
          value={student}
          onChange={(v) => {
            setStudent(v);
            // The work options differ for students; pick again.
            setWork(null);
          }}
        />

        {isStudent && (
          <Section>
            <CollegePicker label="Where do you go to school?" required onChange={setSchoolName} />
            <SelectField
              label="When do you graduate?"
              name="grad_year"
              required
              options={STUDENT_GRAD_YEARS.map((y) => [String(y), String(y)])}
            />
            <TextField label="Major" name="major" placeholder="Finance" value={major} onChange={setMajor} />
          </Section>
        )}

        {student && (
          <fieldset className="border-t border-border pt-5">
            <legend className="text-sm font-semibold text-ink">{isStudent ? "Do you also work?" : "What about work?"}</legend>
            <div className="mt-2 grid gap-2">
              {workOptions.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-3 rounded-input border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-fill has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link"
                >
                  <input
                    type="radio"
                    name="work_choice"
                    value={o.value}
                    checked={work === o.value}
                    onChange={() => setWork(o.value)}
                    className="h-4 w-4 accent-[var(--link)]"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {(hasJob || work === "looking") && (
          <Section>
            <TextField
              label={work === "looking" ? "Most recent role" : work === "founder" ? "Your role" : "Job title"}
              name="job_title"
              placeholder={work === "founder" ? "Founder & CEO" : isStudent ? "Marketing Intern" : "Product Manager"}
              required={hasJob}
              value={jobTitle}
              onChange={setJobTitle}
            />
            <TextField
              label={work === "looking" ? "Most recent company" : work === "founder" ? "Company name" : "Company"}
              name="employer"
              placeholder={work === "founder" ? "Your company" : "Where you work"}
              required={hasJob}
              value={company}
              onChange={setCompany}
            />
            <SelectField label="Industry" name="industry" required={hasJob} options={INDUSTRIES.map((i) => [i, i])} />
          </Section>
        )}

        {student === "no" && work && (
          <Section>
            <YesNo
              legend="Did you go to college?"
              hint="Optional. Alumni are some of the warmest intros there are."
              name="went_to_college"
              value={wentToCollege}
              onChange={setWentToCollege}
            />
            {wentToCollege === "yes" && (
              <>
                <CollegePicker label="Where did you go?" onChange={setSchoolName} />
                <SelectField label="Graduation year" name="grad_year" options={ALUMNI_GRAD_YEARS.map((y) => [String(y), String(y)])} />
              </>
            )}
          </Section>
        )}
      </Step>

      {/* ===== 3. Goals ===== */}
      <Step i={2} step={step} register={register}>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <ToggleChip key={g.value} name="goals" value={g.value} label={g.label} />
          ))}
        </div>
      </Step>

      {/* ===== 4. Interests ===== */}
      <Step i={3} step={step} register={register}>
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
        <p className="text-xs text-muted">{interestCount === 0 ? "Nothing picked yet." : `${interestCount} picked.`}</p>
      </Step>

      {/* ===== 5. Finish ===== */}
      <Step i={4} step={step} register={register}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="headline" className="text-sm font-semibold text-ink">
            Headline
          </label>
          <input
            id="headline"
            name="headline"
            value={headline}
            maxLength={120}
            placeholder="What you do, in a few words"
            onChange={(e) => {
              setHeadline(e.target.value);
              setHeadlineEdited(true);
            }}
            className={input}
          />
          <p className="text-xs text-muted">Shown under your name everywhere.</p>
          {fieldError("headline") && <p className="text-sm text-danger">{fieldError("headline")}</p>}
        </div>
        <ProfileField
          label="LinkedIn URL (optional)"
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
      </Step>

      {stepError && <p className="mt-4 text-sm text-danger">{stepError}</p>}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setStepError(null);
              setStep((s) => s - 1);
            }}
            className={btnSecondary}
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={`${btnPrimary} flex-1`}>
            {step === 3 && interestCount === 0 ? "Skip for now" : "Continue"}
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

// Every step stays mounted (so all answers submit together); only the
// current one is visible.
function Step({
  i,
  step,
  register,
  children,
}: {
  i: number;
  step: number;
  register: (i: number, el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      ref={(el) => register(i, el)}
      className={step === i ? "mt-6 flex flex-col gap-5" : "hidden"}
    >
      {children}
    </div>
  );
}

function YesNo({
  legend,
  hint,
  name,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  name: string;
  value: "yes" | "no" | null;
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((v) => (
          <label
            key={v}
            className="flex h-11 cursor-pointer items-center justify-center rounded-input border border-border-strong bg-surface text-sm font-semibold text-body transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-page has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link"
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 border-t border-border pt-5">{children}</div>;
}

function TextField({
  label,
  name,
  placeholder,
  required,
  value,
  onChange,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold text-ink">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <input
        id={name}
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        maxLength={80}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: [string, string][];
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-semibold text-ink">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <select id={name} name={name} required={required} defaultValue="" className={input}>
        <option value="" disabled={required}>
          Select…
        </option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
