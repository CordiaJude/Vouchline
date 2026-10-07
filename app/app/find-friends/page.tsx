import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FindFriends } from "./find-friends";

export default async function FindFriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 md:py-10">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Find friends</h1>
      <p className="mt-1 text-sm text-muted">See who you already know on Vouchline.</p>
      <FindFriends />
    </div>
  );
}
