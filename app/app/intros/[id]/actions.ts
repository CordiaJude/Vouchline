"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthEmail } from "@/lib/supabase/admin";
import { sendMutualIntroEmail, sendTargetIntroEmail } from "@/lib/email";
import { getQuietHoursSettings, isQuietHoursNow } from "@/lib/quiet-hours";
import { draftBrokerNote } from "@/lib/ai-draft";
import { aiErrorMessage } from "@/lib/ai";

async function getIntroParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  introId: string,
) {
  const { data } = await supabase
    .from("intro_requests")
    .select(
      "requester_id, broker_id, target_id, requester:profiles!intro_requests_requester_id_fkey(full_name), broker:profiles!intro_requests_broker_id_fkey(full_name), target:profiles!intro_requests_target_id_fkey(full_name)",
    )
    .eq("id", introId)
    .maybeSingle();
  return data as {
    requester_id: string;
    broker_id: string;
    target_id: string;
    requester: { full_name: string } | null;
    broker: { full_name: string } | null;
    target: { full_name: string } | null;
  } | null;
}

export async function respondAsBroker(
  introId: string,
  accept: boolean,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const note = formData.get("note");
  const { error } = await supabase.rpc("respond_intro_broker", {
    p_id: introId,
    p_accept: accept,
    p_note: typeof note === "string" && note ? note : null,
  });

  if (!error && accept) {
    const intro = await getIntroParticipants(supabase, introId);
    const targetEmail = intro ? await getAuthEmail(intro.target_id) : null;
    if (intro && targetEmail && intro.broker && intro.requester) {
      const targetQuietHours = await getQuietHoursSettings(supabase, intro.target_id);
      if (!isQuietHoursNow(targetQuietHours)) {
        await sendTargetIntroEmail({
          targetEmail,
          brokerName: intro.broker.full_name,
          requesterName: intro.requester.full_name,
          introId,
        });
      }
    }
  }

  revalidatePath(`/app/intros/${introId}`);
}

export async function respondAsTarget(introId: string, accept: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.rpc("respond_intro_target", {
    p_id: introId,
    p_accept: accept,
  });

  if (!error && accept) {
    const intro = await getIntroParticipants(supabase, introId);
    if (intro && intro.requester && intro.target) {
      const [requesterEmail, targetEmail, brokerEmail] = await Promise.all([
        getAuthEmail(intro.requester_id),
        getAuthEmail(intro.target_id),
        getAuthEmail(intro.broker_id),
      ]);
      if (requesterEmail && targetEmail) {
        await sendMutualIntroEmail({
          requesterEmail,
          requesterName: intro.requester.full_name,
          targetEmail,
          targetName: intro.target.full_name,
          brokerEmail: brokerEmail ?? undefined,
          ccBroker: true,
        });
      }
    }
  }

  revalidatePath(`/app/intros/${introId}`);
}

export async function reportOutcome(introId: string, talked: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase.rpc("report_intro_outcome", {
    p_id: introId,
    p_talked: talked,
  });

  revalidatePath(`/app/intros/${introId}`);
}

export async function withdrawIntro(introId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase.rpc("withdraw_intro", { p_id: introId });
  redirect("/app/intros");
}

// "Write it for me" for the broker's note. Uses the same AI quota as
// intro drafts (check_and_log_ai_draft).
export async function draftBrokerNoteAction(introId: string): Promise<{ text?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error: rateLimitError } = await supabase.rpc("check_and_log_ai_draft");
  if (rateLimitError) {
    return {
      error: rateLimitError.message.includes("rate_limited_daily")
        ? "You've hit today's AI limit."
        : "Give it a few seconds between drafts.",
    };
  }

  const { data: intro } = await supabase
    .from("intro_requests")
    .select(
      "ask, broker_id, requester:profiles!intro_requests_requester_id_fkey(full_name, headline), broker:profiles!intro_requests_broker_id_fkey(full_name), target:profiles!intro_requests_target_id_fkey(full_name, headline)",
    )
    .eq("id", introId)
    .maybeSingle();
  const i = intro as unknown as {
    ask: string;
    broker_id: string;
    requester: { full_name: string; headline: string | null } | null;
    broker: { full_name: string } | null;
    target: { full_name: string; headline: string | null } | null;
  } | null;
  if (!i || i.broker_id !== user.id || !i.requester || !i.target) return { error: "Couldn't load this intro." };

  try {
    const text = await draftBrokerNote({
      brokerName: i.broker?.full_name ?? "",
      requesterName: i.requester.full_name,
      requesterHeadline: i.requester.headline,
      targetName: i.target.full_name,
      targetHeadline: i.target.headline,
      ask: i.ask,
    });
    return { text };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}
