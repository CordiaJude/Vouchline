import Link from "next/link";
import { LegalPage, Section, Bullets, Contact } from "@/app/components/legal-page";

export const metadata = { title: "Terms · Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These are the rules for using Vouchline. By creating an account you agree to them, along with our Privacy policy and Acceptable use rules."
    >
      <Section title="What Vouchline is">
        <p>
          Vouchline is a network of real, confirmed relationships. You connect with people you know, and when you want
          to meet someone new, the app shows who can introduce you and lets you ask. We provide the tools; the people
          involved decide whether to make or accept an intro.
        </p>
      </Section>

      <Section title="Your account">
        <Bullets
          items={[
            "You must be at least 18 years old.",
            "Use your real name and accurate information. One account per person; don't share or transfer it.",
            "Keep your sign-in secure. You're responsible for activity on your account.",
            "If you join through an organization's invite, that organization's admins can see its member list and basic activity metrics.",
          ]}
        />
      </Section>

      <Section title="Your content">
        <p>
          You own what you post: your profile, messages, photos and vouches. You give us permission to store, display
          and send it as needed to run Vouchline (for example, showing your profile to people allowed to see it, or
          delivering your messages). That permission ends when you delete the content or your account, except for
          copies kept briefly for safety or legal reasons.
        </p>
        <p>
          Only post things you have the right to share. Vouches and connection details should be honest: say how you
          really know someone.
        </p>
      </Section>

      <Section title="Rules">
        <p>
          Follow our{" "}
          <Link href="/acceptable-use" className="font-semibold text-link hover:underline">
            Acceptable use
          </Link>{" "}
          rules. We may remove content or suspend or close accounts that break them, or that put other members at risk.
          If we suspend your account, you can contact us if you think it was a mistake.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          Some features use AI to draft messages, suggest search filters or read a resume you upload. AI can be wrong:
          review anything it suggests before you send or save it. You&apos;re responsible for what you send.
        </p>
      </Section>

      <Section title="Introductions and other people">
        <p>
          Vouchline doesn&apos;t guarantee that anyone will make, accept or follow up on an introduction, and we&apos;re
          not responsible for what members say or do, on or off the app. Use good judgment when meeting people.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          We work hard to keep Vouchline running and your data safe, but the service is provided &ldquo;as is&rdquo;,
          without guarantees that it will always be available or error-free. We may change or discontinue features. If
          we make a meaningful change to these terms, we&apos;ll tell you in the app before it takes effect.
        </p>
      </Section>

      <Section title="Limits on liability">
        <p>
          To the extent the law allows, Vouchline isn&apos;t liable for indirect or consequential losses, or for
          content and conduct of other members. Nothing in these terms limits rights you have under laws that
          can&apos;t be waived.
        </p>
      </Section>

      <Section title="Ending your account">
        <p>
          You can delete your account any time in Settings. We may close accounts that break these terms. Sections that
          by their nature should continue (like limits on liability) still apply after an account is closed.
        </p>
      </Section>

      <Section title="Questions">
        <Contact />
      </Section>
    </LegalPage>
  );
}
