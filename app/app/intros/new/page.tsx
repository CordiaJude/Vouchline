import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IntroForm } from "./intro-form";
import { heading1 } from "@/app/components/ui/styles";

export default async function NewIntroPage({
  searchParams,
}: PageProps<"/app/intros/new">) {
  const { target: targetId, broker: brokerId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (typeof targetId !== "string" || typeof brokerId !== "string") {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          <h1 className={heading1}>
            Missing details
          </h1>
          <p className="mt-3 text-sm text-muted">
            Start from{" "}
            <Link href="/app/explore" className="underline">
              Explore
            </Link>{" "}
            and pick a broker to ask.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: target }, { data: broker }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", targetId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", brokerId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!target || !broker) {
    return (
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          <h1 className={heading1}>
            Person not found
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-2xl">
        <h1 className={heading1}>
          Ask for an intro to {target.full_name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          via {broker.full_name}
        </p>

        <div className="mt-6">
          <IntroForm
            targetId={target.id}
            targetName={target.full_name}
            brokerId={broker.id}
            brokerName={broker.full_name}
          />
        </div>
      </div>
    </div>
  );
}
