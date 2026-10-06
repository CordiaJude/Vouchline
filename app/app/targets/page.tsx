import { redirect } from "next/navigation";

// Targets now live in Intros, as the "Want to meet" tab.
export default async function TargetsPage({ searchParams }: PageProps<"/app/targets">) {
  const { add } = await searchParams;
  redirect(typeof add === "string" && add ? `/app/intros?tab=want&add=${encodeURIComponent(add)}` : "/app/intros?tab=want");
}
