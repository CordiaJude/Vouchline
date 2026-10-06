import Link from "next/link";
import { Avatar } from "@/app/components/avatar";
import { btnPrimarySmall, btnSecondarySmall } from "@/app/components/ui/styles";
import { respondContactRequest } from "@/app/components/contact-actions";

export type ContactRow = {
  request_id: string;
  other_id: string;
  full_name: string;
  avatar_url: string | null;
  headline: string | null;
  note: string | null;
  status: "pending" | "accepted" | "declined";
  incoming: boolean;
};

// An incoming cold contact request: accept or decline.
export function ContactRequestRow({ c }: { c: ContactRow }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
      <Link href={`/app/u/${c.other_id}`}>
        <Avatar id={c.other_id} name={c.full_name} src={c.avatar_url} size={48} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/app/u/${c.other_id}`} className="block truncate text-sm font-bold text-ink hover:underline">
          {c.full_name}
        </Link>
        <p className="truncate text-xs text-muted">{c.note ?? c.headline ?? "Wants to add you as a contact"}</p>
      </div>
      <form action={respondContactRequest} className="flex gap-2">
        <input type="hidden" name="request_id" value={c.request_id} />
        <button type="submit" name="accept" value="true" className={btnPrimarySmall}>
          Accept
        </button>
        <button type="submit" name="accept" value="false" className={btnSecondarySmall}>
          Ignore
        </button>
      </form>
    </div>
  );
}
