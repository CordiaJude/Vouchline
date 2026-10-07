import Link from "next/link";
import { Logo } from "@/app/components/logo";
import { signOut } from "@/app/app/actions";
import { authCard, btnSecondary } from "@/app/components/ui/styles";

export const dynamic = "force-dynamic";

// Where suspended or deleted accounts land after signing in.
export default function AccountUnavailablePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="mb-8">
        <Logo />
      </div>
      <div className={`${authCard} text-center`}>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">This account isn&apos;t active</h1>
        <p className="mt-2 text-sm text-muted">
          It was deleted or suspended for breaking our{" "}
          <Link href="/acceptable-use" className="font-semibold text-link hover:underline">
            community rules
          </Link>
          . If you think this is a mistake, contact support.
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className={`${btnSecondary} w-full`}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
