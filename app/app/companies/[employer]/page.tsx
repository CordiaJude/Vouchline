import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonResultCard, type PersonResult } from "@/app/components/person-result-card";
import { heading1, mutedText, link } from "@/app/components/ui/styles";

export default async function CompanyPage({
  params,
}: PageProps<"/app/companies/[employer]">) {
  const { employer } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase.rpc("company_members", { p_employer: employer });
  const members = (data ?? []) as PersonResult[];

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <Link href="/app/companies" className={`${link} text-xs`}>
          ← Companies
        </Link>
        <h1 className={`${heading1} mt-2`}>{employer}</h1>
        <p className={`${mutedText} mt-2`}>
          {members.length} {members.length === 1 ? "person" : "people"} visible to you here.
        </p>

        {members.length === 0 ? (
          <p className={`${mutedText} mt-6`}>No one visible to you at this company.</p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {members.map((m) => (
              <PersonResultCard key={m.id} result={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
