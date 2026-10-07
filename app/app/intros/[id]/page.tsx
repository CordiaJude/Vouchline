import { notFound, redirect } from "next/navigation";
import { openIntroChat } from "@/app/app/messages/actions";
import { createClient } from "@/lib/supabase/server";
import { RespondBrokerForm } from "./respond-broker-form";
import { RespondTargetButtons } from "./respond-target-buttons";
import { WithdrawButton } from "./withdraw-button";
import { ReportOutcomeButtons } from "./report-outcome-buttons";
import { ReportForm } from "@/app/components/report-form";
import { heading1, btnPrimary } from "@/app/components/ui/styles";
import { LoadError, loadErrors } from "@/app/components/load-error";

function statusLabel(status: string, masked: boolean): string {
  if (
    masked &&
    ["declined_broker", "declined_target", "expired"].includes(status)
  ) {
    return "Not available right now";
  }
  const labels: Record<string, string> = {
    pending_broker: "Waiting on broker",
    pending_target: "Waiting on them",
    accepted: "Accepted",
    declined_broker: "Declined",
    declined_target: "Declined",
    expired: "Expired",
    withdrawn: "Withdrawn",
  };
  return labels[status] ?? status;
}

export default async function IntroDetailPage({
  params,
}: PageProps<"/app/intros/[id]">) {
  const pageErrors: string[] = [];
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const loaded1 = await supabase
    .from("intro_requests")
    .select(
      "id, status, ask, broker_note, created_at, requester_id, broker_id, target_id, outcome_reported_at, outcome_talked, requester:profiles!intro_requests_requester_id_fkey(full_name), broker:profiles!intro_requests_broker_id_fkey(full_name), target:profiles!intro_requests_target_id_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  pageErrors.push(...loadErrors(loaded1));
  const { data: intro } = loaded1;

  if (!intro) {
    notFound();
  }

  const requester = intro.requester as unknown as { full_name: string } | null;
  const broker = intro.broker as unknown as { full_name: string } | null;
  const target = intro.target as unknown as { full_name: string } | null;

  const isRequester = intro.requester_id === user.id;
  const isBroker = intro.broker_id === user.id;
  const isTarget = intro.target_id === user.id;

  const others = [
    { id: intro.requester_id, name: requester?.full_name, mine: isRequester },
    { id: intro.broker_id, name: broker?.full_name, mine: isBroker },
    { id: intro.target_id, name: target?.full_name, mine: isTarget },
  ].filter((p) => !p.mine && p.name);

  return (
    <>
      <LoadError errors={pageErrors} className="mx-4 mt-4" />
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          <h1 className={heading1}>
            {requester?.full_name} → {target?.full_name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            via {broker?.full_name}
          </p>

          <p className="mt-4 whitespace-pre-wrap rounded-card bg-fill p-4 text-sm text-ink">
            {intro.ask}
          </p>

          <p className="mt-3 text-sm font-medium text-body">
            Status: {statusLabel(intro.status, isRequester)}
          </p>

          {intro.broker_note && !isRequester && (
            <p className="mt-1 text-sm text-muted">
              Broker note: {intro.broker_note}
            </p>
          )}

          <div className="mt-6">
            {isBroker && intro.status === "pending_broker" && (
              <RespondBrokerForm introId={intro.id} />
            )}
            {isTarget && intro.status === "pending_target" && (
              <RespondTargetButtons introId={intro.id} />
            )}
            {isRequester &&
              ["pending_broker", "pending_target"].includes(intro.status) && (
                <WithdrawButton introId={intro.id} />
              )}
            {intro.status === "accepted" && (
              <form action={openIntroChat}>
                <input type="hidden" name="intro_id" value={intro.id} />
                <button type="submit" className={btnPrimary}>
                  Open group chat
                </button>
              </form>
            )}
            {intro.status === "accepted" &&
              (isRequester || isTarget) &&
              (intro.outcome_reported_at ? (
                <p className="text-sm text-muted">
                  You reported: {intro.outcome_talked ? "Talked" : "Didn't talk"}
                </p>
              ) : (
                <ReportOutcomeButtons introId={intro.id} />
              ))}
          </div>

          {others.length > 0 && (
            <div className="mt-8 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Report a problem
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {others.map((p) => (
                  <ReportForm
                    key={p.id}
                    reportedId={p.id}
                    introRequestId={intro.id}
                    label={`Report ${p.name}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
