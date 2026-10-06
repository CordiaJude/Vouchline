import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RequestConnectionForm } from "./request-form";
import { heading1, mutedText } from "@/app/components/ui/styles";

export default async function RequestConnectionPage({
  searchParams,
}: PageProps<"/app/connect/request">) {
  const { person } = await searchParams;
  const personId = typeof person === "string" ? person : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!personId) {
    redirect("/app/search");
  }

  // The target's name always comes from a fresh, RLS-scoped lookup --
  // never trusted from the query string.
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", personId)
    .is("deleted_at", null)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>Send a connection request</h1>
        <p className={`${mutedText} mt-2`}>
          They&apos;ll get the same questions -- once you both answer, it
          becomes a confirmed connection.
        </p>

        <div className="mt-6">
          {!targetProfile ? (
            <p className={mutedText}>That person couldn&apos;t be found.</p>
          ) : (
            <>
              <RequestConnectionForm
                personId={targetProfile.id}
                personName={targetProfile.full_name}
              />
              <Link
                href={`/app/claim?person=${targetProfile.id}`}
                className="mt-4 inline-block font-label text-sm font-medium text-link"
              >
                Not sure you&apos;ll get a response? Claim instead →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
