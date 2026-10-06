import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClaimPersonForm } from "./claim-form";
import { ClaimSearch } from "./claim-search";
import { heading1, mutedText } from "@/app/components/ui/styles";

export default async function ClaimPage({
  searchParams,
}: PageProps<"/app/claim">) {
  const { person } = await searchParams;
  const personId = typeof person === "string" ? person : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // The target's name always comes from a fresh, RLS-scoped lookup --
  // never trusted from the query string.
  let targetProfile: { id: string; full_name: string } | null = null;
  let notVisible = false;
  if (personId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", personId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) {
      notVisible = true;
    } else {
      targetProfile = data;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>Claim a connection</h1>
        <p className={`${mutedText} mt-2`}>
          Claiming is private and one-sided -- no confirmation needed. It&apos;s
          your own record of a relationship, visible only to you.
        </p>

        <div className="mt-6">
          {personId ? (
            notVisible ? (
              <p className={mutedText}>That person couldn&apos;t be found.</p>
            ) : (
              <ClaimPersonForm personId={targetProfile!.id} personName={targetProfile!.full_name} />
            )
          ) : (
            <ClaimSearch />
          )}
        </div>
      </div>
    </div>
  );
}
