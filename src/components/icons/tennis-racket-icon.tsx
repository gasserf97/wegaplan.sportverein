import type { SVGProps } from "react";

/** Lucide-kompatibles Tennisschläger-Icon für die mobile Tab-Leiste. */
export function TennisRacketIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Schlägerkopf */}
      <ellipse cx="9.5" cy="8.5" rx="6" ry="6.5" />
      {/* Saiten – nur ein Kreuz, damit es bei 20px klar bleibt */}
      <path d="M9.5 3.5v10" />
      <path d="M4.5 8.5h10" />
      {/* Hals / Griff */}
      <path d="M13.2 13.8 19.5 21" />
      <path d="M17.6 19.4h3.2" />
      {/* Ball */}
      <circle cx="18.5" cy="6.5" r="2.4" />
      <path d="M17.1 5.4c.7.5.7 1.7 0 2.2" />
    </svg>
  );
}
