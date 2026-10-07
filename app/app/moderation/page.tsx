import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoadError, loadErrors } from "@/app/components/load-error";
import { btnDangerSmall, btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";
import { resolveReport } from "./actions";

type Report = {
  id: string;
  kind: "user" | "intro" | "message" | "vouch";
  reason: string;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  reporter_id: string;
  reporter_name: string;
  reported_id: string;
  reported_name: string;
  reported_username: string | null;
  reported_suspended: boolean;
  content: string;
  content_removed: boolean;
  intro_request_id: string | null;
  prior_reports: number;
  admin_note: string | null;
};

const TABS = [
  { key: "open", label: "Open" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
] as const;

const KIND_LABEL: Record<Report["kind"], string> = {
  user: "Person",
  intro: "Intro",
  message: "Message",
  vouch: "Vouch",
};

// Site moderators only (platform_admins, 0042). Everyone else gets 404.
export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (!isAdmin) notFound();

  const { status: raw } = await searchParams;
  const status = TABS.some((t) => t.key === raw) ? raw! : "open";
  const result = await supabase.rpc("mod_list_reports", { p_status: status });
  const reports = (result.data ?? []) as Report[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 md:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Moderation</h1>
      <p className="mt-1 text-sm text-muted">Reports from members. Reporters stay anonymous to the people they report.</p>
      <LoadError errors={loadErrors(result)} className="mt-4" />

      <nav className="-mx-4 mt-4 flex border-b border-border px-4" aria-label="Report status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/app/moderation?status=${t.key}`}
            aria-current={status === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 pb-3 pt-1 text-sm font-semibold ${
              status === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-body"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-pill bg-fill px-2 py-0.5 font-semibold text-ink">{KIND_LABEL[r.kind]}</span>
                <span className="text-muted">{new Date(r.created_at).toLocaleString()}</span>
                {r.prior_reports > 0 && (
                  <span className="rounded-pill bg-danger/15 px-2 py-0.5 font-semibold text-danger">
                    {r.prior_reports} other {r.prior_reports === 1 ? "report" : "reports"} on this person
                  </span>
                )}
                {r.reported_suspended && <span className="rounded-pill bg-fill px-2 py-0.5 font-semibold text-muted">Suspended</span>}
              </div>
              <p className="mt-2 text-sm text-ink">
                <Link href={`/app/u/${r.reported_id}`} className="font-bold hover:underline">
                  {r.reported_name}
                </Link>
                {r.reported_username && <span className="text-muted"> @{r.reported_username}</span>}
                <span className="text-muted"> reported by </span>
                <Link href={`/app/u/${r.reporter_id}`} className="font-semibold hover:underline">
                  {r.reporter_name}
                </Link>
              </p>
              <p className="mt-1 text-sm text-body">
                <span className="font-semibold">Reason:</span> {r.reason}
              </p>
              {r.content && (
                <blockquote className="mt-2 whitespace-pre-wrap rounded-input border-l-2 border-border-strong bg-fill px-3 py-2 text-sm text-ink">
                  {r.content}
                  {r.content_removed && <span className="mt-1 block text-xs text-muted">Removed</span>}
                </blockquote>
              )}
              {r.intro_request_id && (
                <Link href={`/app/intros/${r.intro_request_id}`} className="mt-2 inline-block text-xs font-semibold text-link hover:underline">
                  View intro
                </Link>
              )}
              {r.admin_note && <p className="mt-2 text-xs text-muted">Note: {r.admin_note}</p>}

              <form action={resolveReport} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="report_id" value={r.id} />
                <input
                  name="note"
                  placeholder="Note (optional, only moderators see it)"
                  maxLength={1000}
                  className="h-9 rounded-input border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-muted"
                />
                <div className="flex flex-wrap gap-2">
                  {r.status === "open" && (
                    <button type="submit" name="action" value="dismiss" className={btnSecondarySmall}>
                      Dismiss
                    </button>
                  )}
                  {(r.kind === "message" || r.kind === "vouch") && !r.content_removed && (
                    <button type="submit" name="action" value="remove_content" className={btnPrimarySmall}>
                      Remove {r.kind}
                    </button>
                  )}
                  {r.reported_suspended ? (
                    <button type="submit" name="action" value="unsuspend" className={btnSecondarySmall}>
                      Unsuspend {r.reported_name.split(" ")[0]}
                    </button>
                  ) : (
                    <button type="submit" name="action" value="suspend" className={btnDangerSmall}>
                      Suspend {r.reported_name.split(" ")[0]}
                    </button>
                  )}
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
