import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PendingItem } from "./pending-item";
import { heading1, heading2 } from "@/app/components/ui/styles";
import { ContactRequestRow, type ContactRow } from "@/app/components/contact-request-row";
import { LoadError, loadErrors } from "@/app/components/load-error";

export default async function PendingConnectionsPage() {
  const pageErrors: string[] = [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const loaded1 = await Promise.all([
    supabase.rpc("pending_for_me"),
    supabase.rpc("my_contacts"),
  ]);
  pageErrors.push(...loadErrors(...loaded1));
  const [{ data: pending }, { data: contacts }] = loaded1;
  const contactRequests = ((contacts ?? []) as ContactRow[]).filter(
    (c) => c.incoming && c.status === "pending",
  );

  return (
    <>
      <LoadError errors={pageErrors} className="mx-4 mt-4" />
      <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
        <div className="w-full max-w-2xl">
          <h1 className={heading1}>
            Waiting on you
          </h1>

          {contactRequests.length > 0 && (
            <section className="mt-6">
              <h2 className={heading2}>Contact requests</h2>
              <p className="mt-1 text-sm text-muted">People who&apos;d like to be in touch.</p>
              <div className="mt-3 flex flex-col gap-3">
                {contactRequests.map((c) => (
                  <ContactRequestRow key={c.request_id} c={c} />
                ))}
              </div>
            </section>
          )}

          {contactRequests.length > 0 && pending && pending.length > 0 && (
            <h2 className={`${heading2} mt-10`}>Confirm connections</h2>
          )}
          {!pending || pending.length === 0 ? (
            contactRequests.length === 0 && (
              <p className="mt-4 text-sm text-muted">Nothing to answer right now.</p>
            )
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {pending.map(
                (item: { connection_id: string; full_name: string }) => (
                  <PendingItem
                    key={item.connection_id}
                    connectionId={item.connection_id}
                    name={item.full_name}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
