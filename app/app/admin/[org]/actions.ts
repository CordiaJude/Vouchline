"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendOrgInviteEmail } from "@/lib/email";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export type InviteState = { error?: string; success?: boolean };

export async function createInvite(
  orgId: string,
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { supabase, user } = await requireAuth();

  const emailRaw = formData.get("email");
  const email = typeof emailRaw === "string" && emailRaw.trim() ? emailRaw.trim() : null;
  const maxUses = Math.max(1, Number(formData.get("max_uses")) || 1);
  const days = Math.max(1, Number(formData.get("days")) || 14);

  const { data: org } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("org_invites")
    .insert({
      org_id: orgId,
      created_by: user.id,
      email,
      max_uses: maxUses,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    })
    .select("token")
    .single();

  if (error) {
    return { error: error.message };
  }

  if (email && org) {
    await sendOrgInviteEmail({ toEmail: email, orgName: org.name, token: data.token });
  }

  revalidatePath(`/app/admin/${orgId}`);
  return { success: true };
}

export async function revokeInvite(orgId: string, token: string) {
  const { supabase } = await requireAuth();
  await supabase
    .from("org_invites")
    .delete()
    .eq("token", token)
    .eq("org_id", orgId);
  revalidatePath(`/app/admin/${orgId}`);
}

export async function resendInvite(orgId: string, token: string) {
  const { supabase } = await requireAuth();
  const [{ data: invite }, { data: org }] = await Promise.all([
    supabase
      .from("org_invites")
      .select("email")
      .eq("token", token)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase.from("orgs").select("name").eq("id", orgId).maybeSingle(),
  ]);
  if (invite?.email && org) {
    await sendOrgInviteEmail({ toEmail: invite.email, orgName: org.name, token });
  }
}

export async function setMemberRole(
  orgId: string,
  userId: string,
  role: "admin" | "member",
) {
  const { supabase } = await requireAuth();
  await supabase
    .from("memberships")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  revalidatePath(`/app/admin/${orgId}`);
}

export async function removeMember(orgId: string, userId: string) {
  const { supabase } = await requireAuth();
  await supabase
    .from("memberships")
    .update({ status: "removed" })
    .eq("org_id", orgId)
    .eq("user_id", userId);
  revalidatePath(`/app/admin/${orgId}`);
}

export async function resolveReport(
  orgId: string,
  reportId: string,
  action: "remove_member" | "dismiss",
) {
  const { supabase } = await requireAuth();
  await supabase.rpc("admin_resolve_report", {
    p_org: orgId,
    p_report_id: reportId,
    p_action: action,
  });
  revalidatePath(`/app/admin/${orgId}`);
}

export type ImportState = {
  error?: string;
  imported?: number;
  skipped?: number;
};

export async function importRoster(
  orgId: string,
  _prevState: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase, user } = await requireAuth();

  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please choose a CSV file." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { error: "The CSV is empty." };
  }

  const dataRows =
    rows[0][0]?.toLowerCase() === "full_name" ? rows.slice(1) : rows;

  const { data: org } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) {
    return { error: "Org not found." };
  }

  const { data: existingInvites } = await supabase
    .from("org_invites")
    .select("email")
    .eq("org_id", orgId)
    .gt("expires_at", new Date().toISOString())
    .not("email", "is", null);
  const existingEmails = new Set(
    (existingInvites ?? []).map((i) => (i.email as string).toLowerCase()),
  );

  const seenInBatch = new Set<string>();
  const toCreate: {
    full_name: string | null;
    email: string;
    grad_year: number | null;
    pledge_class: string | null;
  }[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const [fullName, email, gradYearRaw, pledgeClass] = row;
    if (!email || !email.includes("@")) {
      skipped++;
      continue;
    }
    const emailLower = email.toLowerCase();
    if (existingEmails.has(emailLower) || seenInBatch.has(emailLower)) {
      skipped++;
      continue;
    }
    seenInBatch.add(emailLower);
    const gradYear = gradYearRaw ? parseInt(gradYearRaw, 10) : NaN;
    toCreate.push({
      full_name: fullName || null,
      email: emailLower,
      grad_year: Number.isFinite(gradYear) ? gradYear : null,
      pledge_class: pledgeClass || null,
    });
  }

  if (toCreate.length === 0) {
    return {
      imported: 0,
      skipped,
      error: "No new rows to import (all duplicates or invalid).",
    };
  }

  const insertPayload = toCreate.map((r) => ({
    org_id: orgId,
    created_by: user.id,
    email: r.email,
    max_uses: 1,
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    full_name: r.full_name,
    grad_year: r.grad_year,
    pledge_class: r.pledge_class,
  }));

  const { data: created, error } = await supabase
    .from("org_invites")
    .insert(insertPayload)
    .select("token, email");

  if (error) {
    return { error: error.message };
  }

  const createdRows = created ?? [];
  for (let i = 0; i < createdRows.length; i += 50) {
    const chunk = createdRows.slice(i, i + 50);
    await Promise.all(
      chunk.map((r) =>
        sendOrgInviteEmail({
          toEmail: r.email as string,
          orgName: org.name,
          token: r.token as string,
        }),
      ),
    );
  }

  revalidatePath(`/app/admin/${orgId}`);
  return { imported: createdRows.length, skipped };
}
