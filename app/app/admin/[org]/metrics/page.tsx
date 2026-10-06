import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Meter, BarList, StatusBar } from "./charts";
import { heading1 } from "@/app/components/ui/styles";

// Pilot thresholds: MVP guesses per the project's own "tune after week 1"
// convention (same one used for the intro rate limits) -- not derived
// from any prior pilot data, since this is the first one.
const THRESHOLDS = {
  activation: 60,
  medianEdges: 3,
  pathCoverage: 50,
  introParticipation: 30,
  brokerResponse72h: 80,
  completionRate: 50,
  talkedShare: 50,
};

type ActivationRow = { grad_year: number | null; member_count: number; activated_count: number };
type ParticipationRow = { cohort: string; member_count: number; with_request_count: number };
type Outcomes = { talked: number; did_not_talk: number; no_response: number };

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((1000 * numerator) / denominator) / 10;
}

export default async function AdminMetricsPage({
  params,
}: PageProps<"/app/admin/[org]/metrics">) {
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

  const [
    { data: activation },
    { data: medianEdges },
    { data: pathCoverage },
    { data: participation },
    { data: brokerResponse },
    { data: completionRate },
    { data: outcomes },
  ] = await Promise.all([
    supabase.rpc("admin_metric_activation", { p_org: orgId }),
    supabase.rpc("admin_metric_median_edges", { p_org: orgId }),
    supabase.rpc("admin_metric_path_coverage", { p_org: orgId }),
    supabase.rpc("admin_metric_intro_participation", { p_org: orgId }),
    supabase.rpc("admin_metric_broker_response_72h", { p_org: orgId }),
    supabase.rpc("admin_metric_completion_rate", { p_org: orgId }),
    supabase.rpc("admin_metric_outcomes", { p_org: orgId }),
  ]);

  const activationRows = (activation ?? []) as ActivationRow[];
  const activationTotals = activationRows.reduce(
    (acc, r) => ({
      members: acc.members + r.member_count,
      activated: acc.activated + r.activated_count,
    }),
    { members: 0, activated: 0 },
  );

  const participationRows = (participation ?? []) as ParticipationRow[];
  const participationTotals = participationRows.reduce(
    (acc, r) => ({
      members: acc.members + r.member_count,
      withRequest: acc.withRequest + r.with_request_count,
    }),
    { members: 0, withRequest: 0 },
  );

  const outcomeRow = (outcomes?.[0] ?? {
    talked: 0,
    did_not_talk: 0,
    no_response: 0,
  }) as Outcomes;
  const reportedOutcomes = outcomeRow.talked + outcomeRow.did_not_talk;

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>
          {org.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pilot metrics
        </p>

        <section className="mt-8">
          <div className="rounded-card border border-border px-4">
            <Meter
              label="Activation (≥1 connection)"
              actual={pct(activationTotals.activated, activationTotals.members)}
              threshold={THRESHOLDS.activation}
            />
            <Meter
              label="Path coverage (searches with ≥1 broker)"
              actual={Number(pathCoverage ?? 0)}
              threshold={THRESHOLDS.pathCoverage}
            />
            <Meter
              label="Students with ≥1 intro request"
              actual={pct(participationTotals.withRequest, participationTotals.members)}
              threshold={THRESHOLDS.introParticipation}
            />
            <Meter
              label="Broker response within 72h"
              actual={Number(brokerResponse ?? 0)}
              threshold={THRESHOLDS.brokerResponse72h}
            />
            <Meter
              label="Intro completion rate"
              actual={Number(completionRate ?? 0)}
              threshold={THRESHOLDS.completionRate}
            />
            <Meter
              label="Reported outcomes that talked"
              actual={pct(outcomeRow.talked, reportedOutcomes)}
              threshold={THRESHOLDS.talkedShare}
            />
          </div>
          {/* Different scale from the % meters above (a raw edge count,
              not a ratio) -- kept as its own stat rather than forced onto
              a shared axis, per "one axis, never mixed scales." */}
          <div className="mt-3 flex items-center justify-between rounded-card border border-border px-4 py-3">
            <span className="text-sm text-body">Median confirmed edges / active user</span>
            <span className="text-sm font-medium text-ink">
              {Number(medianEdges ?? 0)}
              <span className="ml-1.5 text-xs font-normal text-muted">
                / {THRESHOLDS.medianEdges} target
              </span>
            </span>
          </div>
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Activation by grad year
          </h2>
          <BarList
            rows={activationRows.map((r) => ({
              label: String(r.grad_year ?? "Unknown"),
              numerator: r.activated_count,
              denominator: r.member_count,
            }))}
          />
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Intro requests by cohort
          </h2>
          <BarList
            rows={participationRows.map((r) => ({
              label: r.cohort,
              numerator: r.with_request_count,
              denominator: r.member_count,
            }))}
          />
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-label text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            Outcomes
          </h2>
          <StatusBar
            segments={[
              { label: "Talked", value: outcomeRow.talked, status: "good" },
              { label: "Awaiting response", value: outcomeRow.no_response, status: "warning" },
              { label: "Didn't talk", value: outcomeRow.did_not_talk, status: "critical" },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
