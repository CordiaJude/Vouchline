import { z } from "zod";

const emptyToUndefined = (val: unknown) => {
  if (val === null) return undefined;
  return typeof val === "string" && val.trim() === "" ? undefined : val;
};

export const profileFieldsSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name must be at most 80 characters."),
  headline: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120, "Headline must be at most 120 characters.").optional(),
  ),
  grad_year: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .min(1940, "Graduation year must be 1940 or later.")
      .max(2040, "Graduation year must be 2040 or earlier.")
      .optional(),
  ),
  pledge_class: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(40, "Pledge class must be at most 40 characters.").optional(),
  ),
  employer: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(80, "Employer must be at most 80 characters.").optional(),
  ),
  city: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(80, "City must be at most 80 characters.").optional(),
  ),
  linkedin_url: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(
        /^https:\/\/(www\.)?linkedin\.com\//,
        "LinkedIn URL must start with https://linkedin.com/ or https://www.linkedin.com/",
      )
      .optional(),
  ),
  username: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/^@/, "") || undefined : undefined),
    z
      .string()
      .regex(/^(?!\.)(?!.*\.\.)[a-z0-9_.]{3,30}(?<!\.)$/, "3–30 characters: letters, numbers, underscores and periods.")
      .optional(),
  ),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(["student", "working", "founder", "looking", "other"]).optional(),
  ),
  job_title: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(80, "Job title must be at most 80 characters.").optional(),
  ),
  industry: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(60).optional(),
  ),
  // Picked from the college list (uuid) or typed when "not listed".
  school_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  school_name: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(160, "School name must be at most 160 characters.").optional(),
  ),
  major: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(80, "Major must be at most 80 characters.").optional(),
  ),
  // Set client-side by AvatarUpload (a Supabase Storage public URL), not
  // user-typed -- still validated as a URL so a tampered form field can't
  // write an arbitrary string into the column.
  avatar_url: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
});

export const onboardingSchema = profileFieldsSchema.extend({
  is_18_plus: z.literal(true, {
    error: "You must confirm you are 18 or older to continue.",
  }),
});

export type ProfileFieldsInput = z.infer<typeof profileFieldsSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export function parseProfileFormData(formData: FormData) {
  return profileFieldsSchema.safeParse({
    full_name: formData.get("full_name"),
    headline: formData.get("headline"),
    grad_year: formData.get("grad_year"),
    pledge_class: formData.get("pledge_class"),
    employer: formData.get("employer"),
    city: formData.get("city"),
    linkedin_url: formData.get("linkedin_url"),
    avatar_url: formData.get("avatar_url"),
    username: formData.get("username"),
    status: formData.get("status"),
    job_title: formData.get("job_title"),
    industry: formData.get("industry"),
    school_id: formData.get("school_id"),
    school_name: formData.get("school_name"),
    major: formData.get("major"),
  });
}

export function parseOnboardingFormData(formData: FormData) {
  return onboardingSchema.safeParse({
    full_name: formData.get("full_name"),
    headline: formData.get("headline"),
    grad_year: formData.get("grad_year"),
    pledge_class: formData.get("pledge_class"),
    employer: formData.get("employer"),
    city: formData.get("city"),
    linkedin_url: formData.get("linkedin_url"),
    avatar_url: formData.get("avatar_url"),
    status: formData.get("status"),
    job_title: formData.get("job_title"),
    industry: formData.get("industry"),
    school_id: formData.get("school_id"),
    school_name: formData.get("school_name"),
    major: formData.get("major"),
    is_18_plus: formData.get("is_18_plus") === "on",
  });
}
