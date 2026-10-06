export const metadata = { title: "Acceptable Use — Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-lg">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Acceptable use
        </h1>
        <p className="mt-2 font-body text-sm text-muted">
          The short version: treat this like your chapter&apos;s network,
          because it is.
        </p>

        <div className="mt-8 flex flex-col gap-6 font-body text-sm text-body">
          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Don&apos;t
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                Claim a relationship that doesn&apos;t exist, or inflate one
                to get an introduction.
              </li>
              <li>Impersonate another member or create a fake account.</li>
              <li>
                Use intro requests to spam, solicit, or sell to people who
                haven&apos;t asked for it.
              </li>
              <li>
                Scrape, export, or share the roster or member data outside
                the app.
              </li>
              <li>
                Harass, threaten, or repeatedly contact someone who has
                blocked you or asked you to stop.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              If something goes wrong
            </h2>
            <p className="mt-2">
              You can block anyone from Settings or their profile, and
              report a specific incident from any intro thread. Reports go
              to your chapter admin, who can remove a member from the
              chapter.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Enforcement
            </h2>
            <p className="mt-2">
              A chapter admin can act on a report by removing a member.
              Repeated or serious violations can result in permanent
              removal from the pilot.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
