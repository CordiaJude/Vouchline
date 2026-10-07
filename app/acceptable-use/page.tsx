import { LegalPage, Section, Bullets, Contact } from "@/app/components/legal-page";

export const metadata = { title: "Acceptable use · Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable use"
      intro="Vouchline runs on trust: people vouch for each other and pass along introductions. These rules keep it that way. Breaking them can get content removed or an account suspended."
    >
      <Section title="Be real">
        <Bullets
          items={[
            "Use your real identity. Don't pretend to be someone else or a company you don't represent.",
            "Only confirm connections with people you actually know, and describe the relationship honestly.",
            "Write vouches that are true and specific. No paid, traded or fake vouches.",
            "Don't verify an email address that isn't yours.",
          ]}
        />
      </Section>

      <Section title="Be respectful">
        <Bullets
          items={[
            "No harassment, threats, bullying or hate based on who someone is.",
            "No sexual content, and nothing involving minors, ever.",
            "Don't share other people's private information, or screenshots of private chats, without permission.",
            "If someone declines an intro, ignores a request or blocks you, leave it there.",
          ]}
        />
      </Section>

      <Section title="No spam or scams">
        <Bullets
          items={[
            "No mass or copy-paste contact requests, messages or intro asks.",
            "No selling, recruiting or fundraising pitches to people who didn't ask for them.",
            "No scams, phishing, malware or links meant to deceive.",
            "Don't scrape, copy or bulk-export member data, or use bots or automation on the site.",
          ]}
        />
      </Section>

      <Section title="Use the tools as intended">
        <Bullets
          items={[
            "Don't try to get around blocks, limits, privacy settings or suspensions.",
            "Don't test whether email addresses have accounts, or probe the site's security.",
            "Don't use AI features to create misleading or abusive content.",
          ]}
        />
      </Section>

      <Section title="Reporting">
        <p>
          See something that breaks these rules? Use <b>Report</b> on the message, vouch or profile (or in a chat&apos;s
          ⋯ menu). Reports are anonymous. You can also block anyone at any time.
        </p>
        <Contact />
      </Section>
    </LegalPage>
  );
}
