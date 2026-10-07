"use server";

import * as z from "zod/v4";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { askStructured, aiErrorMessage } from "@/lib/ai";
import { INDUSTRIES } from "@/lib/profile-options";

const Parsed = z.object({
  keywords: z.string().describe("Name, company or role words to text-search; empty string if none."),
  school: z.string().nullable().describe("College/university name if mentioned, else null."),
  industry: z.enum(INDUSTRIES).nullable(),
  city: z.string().nullable().describe("City name only, e.g. 'Dallas'; null if none."),
  grad_year: z.number().int().nullable(),
  students_only: z.boolean(),
  summary: z.string().describe("A 3-8 word summary of who they're looking for."),
});

export type AiSearchResult = {
  error?: string;
  keywords?: string;
  school?: { id: string; name: string } | null;
  industry?: string;
  city?: string;
  gradYear?: string;
  studentsOnly?: boolean;
  summary?: string;
};

// Turns "a finance person from Baylor in Dallas" into Explore filters.
// The model only sees the member's own sentence -- no profiles.
export async function aiSearch(text: string): Promise<AiSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ask = text.trim().slice(0, 300);
  if (ask.length < 3) return { error: "Describe who you're looking for." };

  const { error: rl } = await supabase.rpc("check_and_log_ai_draft");
  if (rl) return { error: rl.message.includes("rate_limited_daily") ? "You've hit today's AI limit." : "Give it a few seconds." };

  try {
    const p = await askStructured({
      schema: Parsed,
      maxTokens: 1000,
      system:
        "Convert a request to find people on a professional networking app into search filters. " +
        `Industry must be one of: ${INDUSTRIES.join(", ")} -- or null if unclear. Only fill a field ` +
        "the request actually implies. Put role or company words (e.g. 'product manager', 'Google') in keywords.",
      content: ask,
    });
    let school: { id: string; name: string } | null = null;
    if (p.school) {
      const { data } = await supabase.rpc("search_colleges", { q: p.school });
      const top = (data as { id: string; name: string }[] | null)?.[0];
      if (top) school = { id: top.id, name: top.name };
    }
    return {
      keywords: p.keywords,
      school,
      industry: p.industry ?? "",
      city: p.city ?? "",
      gradYear: p.grad_year ? String(p.grad_year) : "",
      studentsOnly: p.students_only,
      summary: p.summary,
    };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}
