"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Flips the caller's own side of a connection between public and
// private. The connection only shows to others while both sides are
// public (see 0030_connection_visibility.sql).
export async function setConnectionVisibility(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const connectionId = formData.get("connection_id");
  if (typeof connectionId !== "string" || !connectionId) return;

  await supabase.rpc("set_connection_visibility", {
    p_connection: connectionId,
    p_public: formData.get("public") === "true",
  });
  revalidatePath("/app/network");
}
