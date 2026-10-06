import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWeeklyDigestEmail } from "@/lib/email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: counts, error } = await admin.rpc("verified_path_counts");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  for (const row of counts ?? []) {
    if (row.path_count < 1) continue;

    const { data } = await admin.auth.admin.getUserById(row.user_id);
    const email = data.user?.email;
    if (!email) continue;

    await sendWeeklyDigestEmail({ toEmail: email, pathCount: row.path_count });
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
