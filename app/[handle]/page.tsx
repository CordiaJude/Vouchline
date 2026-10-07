import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/app/components/avatar";
import { Logo } from "@/app/components/logo";
import { btnPrimary, btnSecondary } from "@/app/components/ui/styles";
import { getPublicCard, usernameFromHandle } from "./card";

// Share links: vouchline.com/@jordan. Signed-in members go straight to
// the full profile; everyone else sees a public card (only for people
// who chose "Let people find me") with a way to join.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const username = usernameFromHandle((await params).handle);
  const card = username ? await getPublicCard(username) : null;
  if (!card) return { title: "Vouchline" };
  const title = `${card.full_name} (@${card.username}) · Vouchline`;
  const description = card.headline
    ? `${card.headline}. Connect with ${card.full_name.split(" ")[0]} on Vouchline.`
    : `Connect with ${card.full_name} on Vouchline: warm intros through people who actually know you.`;
  return { title, description, openGraph: { title, description, type: "profile" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const username = usernameFromHandle((await params).handle);
  if (!username) notFound();
  const card = await getPublicCard(username);
  if (!card) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(`/app/u/${card.id}`);

  const first = card.full_name.split(" ")[0];
  const back = encodeURIComponent(`/app/u/${card.id}`);

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8">
      <div className="mb-10">
        <Logo />
      </div>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 text-center">
        <span className="ring-brand-gradient mx-auto p-[3px]">
          <span className="block rounded-full bg-surface p-[3px]">
            <Avatar id={card.id} name={card.full_name} src={card.avatar_url} size={96} />
          </span>
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{card.full_name}</h1>
        <p className="text-sm text-muted">@{card.username}</p>
        {card.headline && <p className="mt-3 text-sm text-body">{card.headline}</p>}
        <p className="mt-1 text-xs text-muted">
          {[card.city, card.school_name].filter(Boolean).join(" · ")}
        </p>
        {card.connections_count > 0 && (
          <p className="mt-4 text-sm text-ink">
            <span className="font-bold">{card.connections_count}</span>{" "}
            <span className="text-muted">verified {card.connections_count === 1 ? "connection" : "connections"}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Link href={`/signup?redirect_to=${back}`} className={btnPrimary}>
            Join Vouchline to connect with {first}
          </Link>
          <Link href={`/login?redirect_to=${back}`} className={btnSecondary}>
            I have an account
          </Link>
        </div>
      </div>
      <p className="mt-6 max-w-xs text-center text-xs text-muted">
        Vouchline is a network of real, confirmed relationships, so every intro comes from someone who actually
        knows you.
      </p>
    </div>
  );
}
