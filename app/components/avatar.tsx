import { avatarColorClass, initials } from "./avatar-color";

const SIZES = {
  128: "h-32 w-32 text-4xl",
  96: "h-24 w-24 text-2xl",
  80: "h-20 w-20 text-2xl",
  64: "h-16 w-16 text-xl",
  56: "h-14 w-14 text-lg",
  48: "h-12 w-12 text-base",
  40: "h-10 w-10 text-sm",
  32: "h-8 w-8 text-xs",
  28: "h-7 w-7 text-xs",
  24: "h-6 w-6 text-[10px]",
  20: "h-5 w-5 text-[11px]",
} as const;

export type AvatarSize = keyof typeof SIZES;

export function Avatar({
  id,
  name,
  src,
  size = 40,
  className,
}: {
  id: string;
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const sizeClasses = SIZES[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${sizeClasses} shrink-0 rounded-full object-cover ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} flex shrink-0 items-center justify-center rounded-full font-label font-bold tracking-tight text-white ${avatarColorClass(id)} ${className ?? ""}`}
      role="img"
      aria-label={name}
    >
      {initials(name) || "?"}
    </div>
  );
}
