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
}: {
  data: MembershipCardData;
}) {
  return (
    <article
      className="membership-card overflow-hidden rounded-2xl text-white shadow-lg print:max-w-[380px] print:shadow-none"
      style={{
        maxWidth: 380,
        background: `linear-gradient(160deg, ${ASC_LAJEN.red} 0%, ${ASC_LAJEN.navy} 55%, ${ASC_LAJEN.green} 100%)`,
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-90">
            ASC Lajen Raiffeisen
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
            src={ASC_LOGOS.icon}
            alt=""
            width={40}
            height={40}
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
        <p className="font-heading text-xl" style={{ color: ASC_LAJEN.navy }}>
          {data.name}
        </p>
        <p className="mt-1 text-sm" style={{ color: "#666666" }}>
          Nr. {data.memberNo} · geb. {formatBirthDate(data.birthDate)}
        </p>
        <p className="mt-3 text-sm font-semibold" style={{ color: ASC_LAJEN.green }}>
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
