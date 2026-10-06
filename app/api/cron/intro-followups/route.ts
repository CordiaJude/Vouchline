import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFollowupEmail } from "@/lib/email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: intros, error } = await admin.rpc("intros_needing_followup");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const intro of intros ?? []) {
    const [requesterEmail, targetEmail, requesterProfile, targetProfile] =
      await Promise.all([
        admin.auth.admin
          .getUserById(intro.requester_id)
          .then((r) => r.data.user?.email ?? null),
        admin.auth.admin
          .getUserById(intro.target_id)
          .then((r) => r.data.user?.email ?? null),
        admin
          .from("profiles")
          .select("full_name")
          .eq("id", intro.requester_id)
          .maybeSingle()
          .then((r) => r.data),
        admin
          .from("profiles")
          .select("full_name")
          .eq("id", intro.target_id)
          .maybeSingle()
          .then((r) => r.data),
      ]);

    if (requesterEmail && targetProfile) {
      await sendFollowupEmail({
        toEmail: requesterEmail,
        otherName: targetProfile.full_name,
        introId: intro.id,
      });
    }
    if (targetEmail && requesterProfile) {
      await sendFollowupEmail({
        toEmail: targetEmail,
        otherName: requesterProfile.full_name,
        introId: intro.id,
      });
    }

    await admin.rpc("mark_followup_sent", { p_id: intro.id });
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
