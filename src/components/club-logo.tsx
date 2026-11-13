import Image from "next/image";
import Link from "next/link";
import { ASC_CLUB, ASC_LOGOS } from "@/lib/brand";
import { cn } from "@/lib/utils";

type ClubLogoProps = {
  variant?: "icon" | "wordmark" | "mark";
  href?: string | null;
  className?: string;
  priority?: boolean;
  /** Accessible label; defaults to club name. */
  alt?: string;
};

const SIZE = {
  icon: { width: 40, height: 40, className: "size-9 sm:size-10" },
  wordmark: { width: 180, height: 48, className: "h-8 w-auto sm:h-9" },
  mark: { width: 120, height: 130, className: "h-14 w-auto" },
} as const;

export function ClubLogo({
  variant = "wordmark",
  href = "/",
  className,
  priority = false,
  alt = ASC_CLUB.name,
}: ClubLogoProps) {
  const src =
    variant === "icon"
      ? ASC_LOGOS.icon
      : variant === "mark"
        ? ASC_LOGOS.mark
        : ASC_LOGOS.wordmark;
  const size = SIZE[variant];
  const image = (
    <Image
      src={src}
      alt={alt}
      width={size.width}
      height={size.height}
      priority={priority}
      className={cn("object-contain", size.className, className)}
    />
  );

  if (href === null) return image;
  return (
    <Link href={href} className="inline-flex items-center" aria-label={alt}>
      {image}
    </Link>
  );
}
