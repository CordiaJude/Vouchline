import Link from "next/link";
import { btnPrimary, btnSecondary, eyebrow } from "@/app/components/ui/styles";
import { Logo } from "@/app/components/logo";

// Forces per-request rendering so proxy.ts's CSP nonce actually reaches
// this page -- a statically prerendered page has no request to read a
// nonce from, so Next's own inline hydration scripts would get blocked.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Verified, not claimed",
    body: "Both people confirm every connection independently. No padded networks, no strangers pretending to know you.",
    icon: "M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V7l8-4z",
  },
  {
    title: "Warm intros on demand",
    body: "Find anyone and see exactly who can introduce you. Ask in one tap; they decide whether to vouch.",
    icon: "M8 12l2.5 2.5L15 10M2 12l4-4 3 3M22 12l-4-4-3 3",
  },
  {
    title: "Your network, visualized",
    body: "Explore your extended network as a living map. You choose which connections are public.",
    icon: "M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 6m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 6m-2 0a2 2 0 104 0 2 2 0 10-4 0M19 18m-2 0a2 2 0 104 0 2 2 0 10-4 0M6.5 7.5l4 3M17.5 7.5l-4 3M17.5 16.5l-4-3",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="hidden h-10 items-center rounded-pill px-4 text-sm font-semibold text-ink hover:bg-fill sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="inline-flex h-10 items-center rounded-pill bg-accent px-5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover">
            Join free
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section>
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <span className={eyebrow}>The relationship-verified network</span>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight text-ink md:text-6xl">
                Meet anyone through people who actually know you.
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                Vouchline maps who really knows whom, then turns those relationships into warm
                introductions to the people you want to meet.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={`${btnPrimary} sm:px-8`}>
                  Create your free account
                </Link>
                <Link href="/login" className={`${btnSecondary} sm:px-8`}>
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted">Free for everyone.</p>
            </div>

            {/* Product preview: what an intro path actually looks like */}
            <div className="mx-auto w-full max-w-md" aria-hidden="true">
              <div className="rounded-card border border-border bg-surface p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Path found</p>
                <div className="mt-4 flex items-center">
                  {[
                    ["You", "avatar-bg-0"],
                    ["MC", "avatar-bg-1"],
                    ["GL", "avatar-bg-2"],
                  ].map(([label, color], i) => (
                    <div key={label} className="flex items-center">
                      {i > 0 && <span className="h-px w-10 bg-border-strong sm:w-14" />}
                      <span className="ring-brand-gradient p-[2px]">
                        <span className="block rounded-full bg-surface p-[2px]">
                          <span className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}>
                            {label}
                          </span>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-base font-bold text-ink">Maya can introduce you to Grace</p>
                <p className="mt-1 text-sm text-muted">
                  Coworkers for 4 years. Both of them confirmed it.
                </p>
                <div className="mt-5 flex gap-2">
                  <span className={`${btnPrimary} h-10 flex-1`}>Ask Maya</span>
                  <span className={`${btnSecondary} h-10`}>View path</span>
                </div>
              </div>
              <div className="mx-6 h-3 rounded-b-card border border-t-0 border-border bg-surface/60" />
              <div className="mx-12 h-3 rounded-b-card border border-t-0 border-border bg-surface/30" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-card border border-border bg-surface p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-fill text-ink">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={f.icon} />
                  </svg>
                </span>
                <h2 className="mt-4 text-lg font-bold tracking-tight text-ink">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Vouchline</span>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/acceptable-use" className="hover:text-ink">Acceptable use</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
