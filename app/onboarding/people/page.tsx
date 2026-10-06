import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/app/components/logo";
import { btnPrimary } from "@/app/components/ui/styles";
import { SuggestedPersonCard, type SuggestedPerson } from "@/app/components/suggested-person-card";
import { interestLabel, goalLabel } from "@/lib/interests";

// Last onboarding step: people to add, ranked by shared interests and
// goals (suggest_people). Fully skippable.
export const dynamic = "force-dynamic";

export default async function OnboardingPeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data } = await supabase.rpc("suggest_people", { p_limit: 24 });
  const people: SuggestedPerson[] = (
    (data ?? []) as Omit<SuggestedPerson, "reasons">[]
  ).map((p) => ({
    ...p,
    reasons: [...(p.shared_interests ?? []).map(interestLabel), ...(p.shared_goals ?? []).map(goalLabel)],
  }));

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 md:py-12">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <Logo />
        <Link href="/app" className="text-sm font-semibold text-muted hover:text-ink">
          Skip
        </Link>
      </div>

      <div className="mt-10 w-full max-w-4xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink md:text-3xl">People you might like</h1>
        <p className="mt-1 text-sm text-muted">
          Based on what you&apos;re into. <span className="font-semibold text-body">Add</span> sends a contact
          request to someone new. <span className="font-semibold text-body">I know them</span> confirms a real
          connection, which is what powers intros.
        </p>

        {people.length === 0 ? (
          <p className="mt-10 rounded-card border border-border bg-surface p-6 text-sm text-muted">
            No suggestions yet. As more people join, they&apos;ll show up here and on your home page.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {people.map((p) => (
              <SuggestedPersonCard key={p.id} person={p} />
            ))}
          </div>
        )}

        <div className="mt-10 flex justify-center">
          <Link href="/app" className={`${btnPrimary} w-full max-w-xs`}>
            Continue to Vouchline
          </Link>
        </div>
      </div>
    </div>
  );
}
