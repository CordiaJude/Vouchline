import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/logo";

export const LEGAL_UPDATED = "October 7, 2026";
// Set NEXT_PUBLIC_SUPPORT_EMAIL in Vercel to show a contact address.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

// Shared layout for Privacy, Terms and Acceptable Use.
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8 md:py-12">
      <div className="mx-auto w-full max-w-2xl">
        <Logo />
        <h1 className="mt-10 text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-body">{intro}</p>
        <div className="mt-8 flex flex-col gap-8">{children}</div>
        <nav className="mt-12 flex flex-wrap gap-5 border-t border-border pt-6 text-sm text-muted">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/acceptable-use" className="hover:text-ink">Acceptable use</Link>
        </nav>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-body">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function Contact() {
  return SUPPORT_EMAIL ? (
    <p>
      Email us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-link hover:underline">
        {SUPPORT_EMAIL}
      </a>
      .
    </p>
  ) : (
    <p>Reach us through the contact details on vouchline&apos;s website.</p>
  );
}
