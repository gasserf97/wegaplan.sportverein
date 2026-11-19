import Image from "next/image";
import { ASC_LAJEN, ASC_LOGOS } from "@/lib/brand";
import { formatBirthDate } from "@/lib/format";
import {
  buildMembershipCardData,
  validityLabel,
  type MembershipCardData,
} from "@/lib/membership-card-data";

export function MembershipCardView({
  data,
  clubName = "Sportverein",
  logoUrl = null,
  colors,
}: {
  data: MembershipCardData;
  clubName?: string;
  logoUrl?: string | null;
  colors?: { start: string; mid: string; end: string };
}) {
  const start = colors?.start ?? ASC_LAJEN.red;
  const mid = colors?.mid ?? ASC_LAJEN.navy;
  const end = colors?.end ?? ASC_LAJEN.green;
  const mark = logoUrl || ASC_LOGOS.icon;
  return (
    <article
      className="membership-card overflow-hidden rounded-2xl text-white shadow-lg print:max-w-[380px] print:shadow-none"
      style={{
        maxWidth: 380,
        background: `linear-gradient(160deg, ${start} 0%, ${mid} 55%, ${end} 100%)`,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-90">
            {clubName}
          </p>
          <h2 className="mt-1 font-heading text-xl leading-tight sm:text-2xl">
            {data.cardTitle}
          </h2>
        </div>
        <span
          className="rounded-md p-1"
          style={{
            backgroundColor: "#ffffff",
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          }}
        >
          <Image
            src={mark}
            alt=""
            width={40}
            height={40}
            unoptimized={Boolean(logoUrl)}
            className="size-10 object-contain"
          />
        </span>
      </div>
      <div
        className="mx-3 mb-3 rounded-xl px-5 py-4"
        style={{
          backgroundColor: "#ffffff",
          color: "#151515",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
      >
        <p className="font-heading text-xl" style={{ color: mid }}>
          {data.name}
        </p>
        <p className="mt-1 text-sm" style={{ color: "#666666" }}>
          Nr. {data.memberNo} · geb. {formatBirthDate(data.birthDate)}
        </p>
        <p className="mt-3 text-sm font-semibold" style={{ color: end }}>
          {data.planTitle}
        </p>
        <p className="mt-1 text-sm font-medium" style={{ color: "#151515" }}>
          {validityLabel(data.periodStart, data.periodEnd, data.interval).replace(/^gültig/, "Gültig")}
        </p>
      </div>
    </article>
  );
}

export function toCardData(input: {
  userId: string;
  name: string;
  birthDate: Date;
  planTitle: string;
  confirmationTitle?: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  interval?: string | null;
}): MembershipCardData {
  return buildMembershipCardData(input);
}
