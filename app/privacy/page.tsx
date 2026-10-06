import Link from "next/link";

export const metadata = { title: "Privacy — Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-6 md:py-10">
      <div className="w-full max-w-lg">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Privacy
        </h1>
        <p className="mt-2 font-body text-sm text-muted">
          Plain language, no legalese we can avoid. Last updated for the
          pilot launch.
        </p>

        <div className="mt-8 flex flex-col gap-6 font-body text-sm text-body">
          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              What we store
            </h2>
            <p className="mt-2">
              Your name, grad year, pledge class, employer, city, and
              LinkedIn URL if you add them. The relationships you confirm
              with other members (who, what kind, how long you&apos;ve known
              each other, and how close). The intro requests you send,
              receive, or broker. Your email address, used only for sign-in
              and app notifications.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Your closeness rating is private
            </h2>
            <p className="mt-2">
              When you confirm a connection, you rate how close it is on a
              1&ndash;3 scale. That number is never shown to the other
              person, to brokers, or to anyone else. It&apos;s used
              internally to rank who&apos;s best positioned to make an
              introduction &mdash; nothing more.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              We don&apos;t sell your data
            </h2>
            <p className="mt-2">
              We don&apos;t sell, rent, or share your data with advertisers
              or data brokers. Your information is visible only to other
              verified members of your chapter, scoped to what the app
              needs to work (search, broker-finding, intro requests).
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Deletion
            </h2>
            <p className="mt-2">
              You can delete your account and profile at any time from
              Settings. This removes your profile and disconnects your
              confirmed relationships. If your chapter&apos;s pilot ends and
              isn&apos;t renewed, all chapter data is deleted &mdash; see
              our{" "}
              <Link href="/terms" className="text-link underline underline-offset-2 hover:text-link-hover">
                Terms
              </Link>{" "}
              for details.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              18+ only
            </h2>
            <p className="mt-2">
              Vouchline is for adults. You confirm you&apos;re 18 or older
              when you create your account, and we don&apos;t knowingly
              collect data from anyone younger.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink">
              Questions
            </h2>
            <p className="mt-2">
              Reach out to your chapter admin, or contact us directly if
              you&apos;re not sure who that is.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
