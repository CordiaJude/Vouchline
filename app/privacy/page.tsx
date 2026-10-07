import Link from "next/link";
import { LegalPage, Section, Bullets, Contact } from "@/app/components/legal-page";

export const metadata = { title: "Privacy · Vouchline" };

// See app/page.tsx for why this is forced dynamic (CSP nonce).
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="Vouchline helps you meet people through others who actually know you. That only works if you trust us with real relationships, so here's exactly what we collect, who can see it, and what we never do. Plain language, no tricks."
    >
      <Section title="What we collect">
        <Bullets
          items={[
            <>
              <b>Account:</b> your email address and, if you use Google sign-in, your name and profile photo from Google.
            </>,
            <>
              <b>Profile:</b> what you add: name, photo, headline, city, whether you&apos;re a student, school, major,
              graduation year, job title, company, industry, work and education history, skills, interests, goals,
              LinkedIn link and username.
            </>,
            <>
              <b>Connections:</b> who you&apos;re connected to, how you know them, for how long, and a private closeness
              rating; plus contact requests and the people you want to meet.
            </>,
            <>
              <b>Activity:</b> intro requests you send, pass on or receive; messages and photos you send in chats;
              vouches you write or receive; reports you make.
            </>,
            <>
              <b>Settings:</b> choices like &ldquo;Let people find me&rdquo;, quiet hours, theme, and, if you turn them
              on, a notification token for your device.
            </>,
            <>
              <b>Technical:</b> basic logs (like errors and the time of a request) so we can keep the app working and
              secure.
            </>,
          ]}
        />
      </Section>

      <Section title="Who can see what">
        <Bullets
          items={[
            <>
              <b>Your profile</b> is visible to people in your orgs and your connections. If &ldquo;Let people find
              me&rdquo; is on, any signed-in member can find it, and your public link (vouchline.com/@you) shows a short
              card to anyone.
            </>,
            <>
              <b>Your closeness ratings are never shown</b> to anyone, including the person you rated. We only use them
              to rank who&apos;s best placed to make an intro.
            </>,
            <>
              <b>Each connection is public or private.</b> It appears on other people&apos;s network maps only if both
              of you chose Public. Your own connections are always visible to you.
            </>,
            <>
              <b>Messages and photos</b> are visible only to the people in that chat. Photos are stored privately and
              only chat members can open them.
            </>,
            <>
              <b>Vouches</b> appear on your profile only after you approve them, and you can hide them any time.
            </>,
            <>
              <b>Verified badges</b> show only the domain (like &ldquo;baylor.edu&rdquo;), never your email address.
            </>,
          ]}
        />
      </Section>

      <Section title="Finding friends from your contacts">
        <p>
          If you use Find friends, the email addresses you choose are scrambled (hashed) on your device before anything
          is sent. We compare those hashes with members who chose &ldquo;Let people find me&rdquo;, show you the
          matches, and then throw the rest away. We don&apos;t store your address book or create profiles for people who
          haven&apos;t joined.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          Some features use AI models run by Groq: writing intro messages, turning a plain-English
          description into search filters, and reading a resume you upload to suggest profile details. For these, we
          send only what&apos;s needed: your own words, public profile details (names and headlines) of the people
          involved, or the text of the resume you chose. We never send closeness ratings, private connections, messages
          or contact details. Resumes aren&apos;t stored by us after the suggestions are made. Groq processes this data to
          return the result, under its terms of service.
        </p>
      </Section>

      <Section title="Services we rely on">
        <p>We use a small number of providers to run Vouchline. They process data only to provide their service to us:</p>
        <Bullets
          items={[
            "Supabase: database, file storage and sign-in",
            "Vercel: hosting",
            "Google: Google sign-in, if you use it",
            "Resend: sending email (sign-in, verification codes, intro updates)",
            "Groq: the AI features above",
            "Your browser's push service (Apple, Google or Mozilla): delivering notifications you turned on",
            "Sentry: error reports, if enabled",
          ]}
        />
      </Section>

      <Section title="What we never do">
        <Bullets
          items={[
            "Sell, rent or trade your data.",
            "Share it with advertisers or data brokers.",
            "Show you ads based on your data.",
            "Use your messages or relationships to train AI.",
          ]}
        />
      </Section>

      <Section title="Cookies">
        <p>
          We use cookies only to keep you signed in and to remember a few choices on your device (like your theme or a
          dismissed tip). No advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <Bullets
          items={[
            "Edit or remove anything on your profile in Settings.",
            "Turn off “Let people find me”, make any connection private, hide any vouch, or block someone.",
            "Turn notifications off per device, or set quiet hours.",
            <>
              Delete your account any time in Settings. This removes your profile, connections, vouches and the
              messages you sent; a few records may be kept briefly where needed for safety or legal reasons (for
              example, an open report about abuse).
            </>,
            "Ask us for a copy of your data or to correct it.",
          ]}
        />
      </Section>

      <Section title="Safety and moderation">
        <p>
          When someone reports a message, vouch or account, our moderators can see the reported content and a copy of it
          is kept with the report so it can be reviewed. Reporters stay anonymous to the person they report. See our{" "}
          <Link href="/acceptable-use" className="font-semibold text-link hover:underline">
            Acceptable use
          </Link>{" "}
          rules.
        </p>
      </Section>

      <Section title="18 and older">
        <p>Vouchline is for adults. We don&apos;t knowingly collect data from anyone under 18.</p>
      </Section>

      <Section title="Changes and questions">
        <p>If we change this policy in a meaningful way, we&apos;ll tell you in the app before it takes effect.</p>
        <Contact />
      </Section>
    </LegalPage>
  );
}
