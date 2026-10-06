"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { draftIntroText } from "@/lib/ai-draft";
import { sendBrokerIntroEmail } from "@/lib/email";
import { getAuthEmail } from "@/lib/supabase/admin";
import { getQuietHoursSettings, isQuietHoursNow } from "@/lib/quiet-hours";

export type DraftState = { text?: string; error?: string };

export async function draftIntroAction(
  targetId: string,
  brokerName: string,
  goal: string,
): Promise<DraftState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  if (!goal.trim()) {
    return { error: "Tell us what you're hoping for first." };
  }

  const { error: rateLimitError } = await supabase.rpc(
    "check_and_log_ai_draft",
  );
  if (rateLimitError) {
    if (rateLimitError.message.includes("rate_limited_burst")) {
      return { error: "Give it a few seconds between drafts." };
    }
    if (rateLimitError.message.includes("rate_limited_daily")) {
      return { error: "You've hit today's AI draft limit." };
    }
    return { error: "Couldn't generate a draft right now." };
  }

  const [{ data: requesterProfile }, { data: targetProfile }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, headline")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, headline")
        .eq("id", targetId)
        .maybeSingle(),
    ]);

  if (!requesterProfile || !targetProfile) {
    return { error: "Couldn't load profile details." };
  }

  try {
    const text = await draftIntroText({
      requesterName: requesterProfile.full_name,
      requesterHeadline: requesterProfile.headline,
      targetName: targetProfile.full_name,
      targetHeadline: targetProfile.headline,
      brokerName,
      goal,
    });
    return { text };
  } catch {
    return { error: "Couldn't generate a draft right now." };
  }
}

export type RequestIntroState = { error?: string };

export async function requestIntroAction(
  targetId: string,
  brokerId: string,
  _prevState: RequestIntroState,
  formData: FormData,
): Promise<RequestIntroState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const ask = formData.get("ask");
  if (typeof ask !== "string" || ask.trim().length < 20) {
    return { error: "Tell them a bit more — at least 20 characters." };
  }

  const { data: introId, error } = await supabase.rpc("request_intro", {
    p_target: targetId,
    p_broker: brokerId,
    p_ask: ask,
  });

  if (error) {
    return { error: friendlyIntroError(error.message) };
  }

  const [{ data: requesterProfile }, { data: targetProfile }, brokerEmail] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", targetId)
        .maybeSingle(),
      getAuthEmail(brokerId),
    ]);

  if (brokerEmail && requesterProfile && targetProfile) {
    const brokerQuietHours = await getQuietHoursSettings(supabase, brokerId);
    if (!isQuietHoursNow(brokerQuietHours)) {
      await sendBrokerIntroEmail({
        brokerEmail,
        requesterName: requesterProfile.full_name,
        targetName: targetProfile.full_name,
        introId,
      });
    }
  }

  redirect(`/app/intros/${introId}`);
}

function friendlyIntroError(message: string): string {
  if (
    message.includes("no_edge_requester_broker") ||
    message.includes("no_edge_broker_target")
  ) {
    return "That path isn't valid anymore.";
  }
  if (message.includes("already_directly_connected")) {
    return "You're already directly connected to them.";
  }
  if (message.includes("not_shared_org")) {
    return "You need to share a chapter or org with this person.";
  }
  if (message.includes("blocked")) {
    return "This introduction isn't available.";
  }
  if (message.includes("too_many_open_requests")) {
    return "You have too many open intro requests already (max 3).";
  }
  if (message.includes("weekly_limit_reached")) {
    return "You've hit your weekly intro request limit (5 per 7 days).";
  }
  if (message.includes("already_requested_this_target")) {
    return "You already asked for an intro to this person in the last 30 days.";
  }
  if (message.includes("broker_inbox_full")) {
    return "This broker has too many pending requests right now. Try again later.";
  }
  return "Something went wrong. Please try again.";
}
