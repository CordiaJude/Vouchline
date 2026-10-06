import Link from "next/link";

export const metadata = { title: "Terms — Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-lg">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Terms
        </h1>
        <p className="mt-2 font-body text-sm text-muted">
          Plain language, no legalese we can avoid. Last updated for the
          pilot launch.
        </p>

        <div className="mt-8 flex flex-col gap-6 font-body text-sm text-body">
          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              What this is
            </h2>
            <p className="mt-2">
              Vouchline is a pilot app for a single chapter, invite-only.
              It helps members find warm introductions through people they
              actually know, instead of cold outreach.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Who can use it
            </h2>
            <p className="mt-2">
              You must be 18 or older and have a valid invite from your
              chapter admin. Accounts aren&apos;t transferable, and
              impersonating someone else is grounds for removal &mdash; see
              our{" "}
              <Link href="/acceptable-use" className="text-link underline underline-offset-2 hover:text-link-hover">
                Acceptable Use
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              This is a pilot
            </h2>
            <p className="mt-2">
              The app is running as a time-boxed pilot for your chapter.
              We&apos;re actively reviewing whether it&apos;s working during
              the pilot period. If the pilot isn&apos;t renewed at the end
              of that period, the app is shut down and all chapter data
              &mdash; profiles, connections, intro requests &mdash; is
              deleted. See our{" "}
              <Link href="/privacy" className="text-link underline underline-offset-2 hover:text-link-hover">
                Privacy
              </Link>{" "}
              page for what we store in the meantime.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              No warranty
            </h2>
            <p className="mt-2">
              This is pilot software. We do our best to keep it working and
              your data safe, but we don&apos;t promise it&apos;ll be
              bug-free or always available.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Changes
            </h2>
            <p className="mt-2">
              If these terms change in a way that matters, we&apos;ll let
              chapter admins know before the pilot continues.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
