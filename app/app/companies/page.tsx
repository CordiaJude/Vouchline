import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/app/components/empty-state";
import { heading1, mutedText, cardOutlined, pill } from "@/app/components/ui/styles";

type Company = { employer: string; member_count: number };

export default async function CompaniesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase.rpc("list_companies");
  const companies = (data ?? []) as Company[];

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>Companies</h1>
        <p className={`${mutedText} mt-2`}>
          Browse people by employer, across your orgs and anyone public.
        </p>

        {companies.length === 0 ? (
          <EmptyState
            headline="No companies to browse yet"
            detail="Companies show up here once people in your network or org add an employer to their profile."
            cta={{ label: "Search for someone directly", href: "/app/search" }}
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {companies.map((c) => (
              <li key={c.employer}>
                <Link
                  href={`/app/companies/${encodeURIComponent(c.employer)}`}
                  className={`${cardOutlined} flex items-center justify-between`}
                >
                  <span className="text-sm font-medium text-ink">{c.employer}</span>
                  <span className={pill}>
                    {c.member_count} {c.member_count === 1 ? "person" : "people"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
