"use server";

import * as z from "zod/v4";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { askStructured, aiErrorMessage } from "@/lib/ai";
import { INDUSTRIES } from "@/lib/profile-options";

const Entry = z.object({
  kind: z.enum(["work", "education"]),
  title: z.string().nullable().describe("work: job title; education: degree, e.g. 'B.B.A.'"),
  organization: z.string().describe("work: company; education: school"),
  field: z.string().nullable().describe("education only: field of study"),
  start_year: z.number().int().nullable(),
  end_year: z.number().int().nullable().describe("null if current"),
  description: z.string().nullable().describe("one or two sentences, or null"),
});

const Extracted = z.object({
  headline: z.string().nullable().describe("Under 100 characters, like 'Product Manager at Northwind'"),
  job_title: z.string().nullable(),
  employer: z.string().nullable(),
  city: z.string().nullable().describe("City, ST if in the US"),
  industry: z.enum(INDUSTRIES).nullable(),
  skills: z.array(z.string()).describe("Up to 15 concrete skills, each under 40 characters"),
  experiences: z.array(Entry).describe("Every job and school listed, newest first, up to 15"),
});
export type ResumeSuggestions = z.infer<typeof Extracted>;
export type ResumeState = { error?: string; suggestions?: ResumeSuggestions };

const MAX_BYTES = 5 * 1024 * 1024;

// Reads a resume / LinkedIn "Save to PDF" and suggests profile fields.
// Nothing is saved here -- the member reviews and applies (applyResume).
// The PDF goes only to Claude for this one request; it isn't stored.
export async function readResume(_prev: ResumeState, formData: FormData): Promise<ResumeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF first." };
  if (file.type !== "application/pdf") return { error: "That needs to be a PDF. On LinkedIn: your profile → More → Save to PDF." };
  if (file.size > MAX_BYTES) return { error: "That PDF is too big (5 MB max)." };

  const { error: rl } = await supabase.rpc("check_and_log_ai_draft");
  if (rl) return { error: rl.message.includes("rate_limited_daily") ? "You've hit today's AI limit." : "Give it a few seconds." };

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const suggestions = await askStructured({
      schema: Extracted,
      maxTokens: 6000,
      effort: "medium",
      system:
        "Extract profile details from a resume or LinkedIn PDF for a professional networking app. " +
        "Copy facts exactly as written; never invent or embellish. Leave anything not in the document " +
        `as null. Industry must be one of: ${INDUSTRIES.join(", ")} -- or null. Ignore contact details ` +
        "(email, phone, address).",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: "Extract the profile details." },
      ],
    });
    return { suggestions };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

// Apply the parts the member kept.
export async function applyResume(payload: {
  fields: { headline?: string; job_title?: string; employer?: string; city?: string; industry?: string };
  skills: string[];
  experiences: ResumeSuggestions["experiences"];
}): Promise<{ error?: string; done?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clip = (v: string | undefined, n: number) => (v && v.trim() ? v.trim().slice(0, n) : undefined);
  const update: Record<string, unknown> = {};
  const f = payload.fields;
  if (clip(f.headline, 120)) update.headline = clip(f.headline, 120);
  if (clip(f.job_title, 80)) update.job_title = clip(f.job_title, 80);
  if (clip(f.employer, 80)) update.employer = clip(f.employer, 80);
  if (clip(f.city, 80)) update.city = clip(f.city, 80);
  if (f.industry && (INDUSTRIES as readonly string[]).includes(f.industry)) update.industry = f.industry;

  if (payload.skills.length) {
    const { data: current } = await supabase.from("profiles").select("skills").eq("id", user.id).maybeSingle();
    const merged = [...(current?.skills ?? [])];
    for (const s of payload.skills.map((x) => x.trim().slice(0, 40)).filter(Boolean)) {
      if (!merged.some((m: string) => m.toLowerCase() === s.toLowerCase())) merged.push(s);
    }
    update.skills = merged.slice(0, 30);
  }

  if (Object.keys(update).length) {
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (error) return { error: "Couldn't save your profile details." };
  }

  const year = (y: number | null) => (y && y >= 1940 && y <= 2050 ? y : null);
  const rows = payload.experiences.slice(0, 15).map((e) => {
    const start = year(e.start_year);
    let end = year(e.end_year);
    if (start && end && end < start) end = null;
    return {
      user_id: user.id,
      kind: e.kind,
      title: e.title?.slice(0, 100) || null,
      organization: e.organization.slice(0, 160),
      field: e.kind === "education" ? e.field?.slice(0, 100) || null : null,
      start_year: start,
      end_year: end,
      description: e.description?.slice(0, 600) || null,
    };
  }).filter((r) => r.organization);
  if (rows.length) {
    const { error } = await supabase.from("profile_experiences").insert(rows);
    if (error) return { error: error.message.includes("too_many") ? "Your history is full; remove some entries first." : "Couldn't add your history." };
  }

  revalidatePath("/app", "layout");
  return { done: true };
}
