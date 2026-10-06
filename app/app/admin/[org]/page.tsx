import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembersTable } from "./members-table";
import { InvitesList } from "./invites-list";
import { InviteForm } from "./invite-form";
import { CsvImportForm } from "./csv-import-form";
import { ReportsQueue } from "./reports-queue";
import { heading1 } from "@/app/components/ui/styles";

export default async function AdminOrgPage({
  params,
}: PageProps<"/app/admin/[org]">) {
  const { org: orgId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  // Not an admin (or not even a member): treat identically to "doesn't
  // exist" rather than confirming the org/admin-ness to a non-admin.
  if (!membership || membership.role !== "admin") {
    notFound();
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) {
    notFound();
  }

  const [{ data: members }, { data: invites }, { data: reports }] =
    await Promise.all([
      supabase.rpc("admin_list_members", { p_org: orgId }),
      supabase
        .from("org_invites")
        .select(
          "token, email, full_name, uses, max_uses, expires_at, created_at",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase.rpc("admin_list_reports", { p_org: orgId }),
    ]);

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>
          {org.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Admin dashboard
        </p>
        <Link
          href={`/app/admin/${orgId}/metrics`}
          className="mt-2 inline-block text-sm font-medium text-ink underline"
        >
          View pilot metrics
        </Link>

        <section className="mt-8">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Members
          </h2>
          <MembersTable orgId={orgId} members={members ?? []} />
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Pending invites
          </h2>
          <InvitesList orgId={orgId} invites={invites ?? []} />
          <InviteForm orgId={orgId} />
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Import roster
          </h2>
          <CsvImportForm orgId={orgId} />
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Reports
          </h2>
          <ReportsQueue orgId={orgId} reports={reports ?? []} />
        </section>
      </div>
    </div>
  );
}
