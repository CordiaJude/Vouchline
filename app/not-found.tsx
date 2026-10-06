import Link from "next/link";
import { eyebrow, mutedText, btnPrimary, link } from "@/app/components/ui/styles";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className={eyebrow}>404</span>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-ink">
        Nothing here
      </h1>
      <p className={`${mutedText} mt-3 max-w-sm text-base`}>
        That page doesn&apos;t exist, or isn&apos;t visible to you.
      </p>
      <Link href="/app" className={`${btnPrimary} mt-8`}>
        Go to dashboard
      </Link>
      <Link href="/" className={`${link} mt-4 text-sm`}>
        Back to the homepage
      </Link>
    </div>
  );
}
