import { cache } from "react";
import { ASC_CLUB, ASC_LAJEN } from "@/lib/brand";
import { getCurrentClubRecord } from "@/lib/club-settings";
import { clubLogoUrl, clubStampUrl } from "@/lib/club-profile";
import { isLegacyClub } from "@/lib/tenant";

const HEX = /^#[0-9a-fA-F]{6}$/;

export type ClubBrand = {
  /** false, wenn kein Verein im Kontext ist. */
  legacy: boolean;
  name: string;
  namePrimary: string;
  nameSecondary: string;
  president: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  taxId: string;
  vatId: string;
  legalForm: string;
  tennisClubName: string;
  colorPrimary: string;
  colorCardStart: string;
  colorCardMid: string;
  colorCardEnd: string;
  logoUrl: string | null;
  stampUrl: string | null;
};

type BrandSettings = {
  letterName: string;
  namePrimary: string;
  nameSecondary: string;
  president: string;
  street: string;
  postalCode: string;
  city: string;
  province: string;
  taxId: string;
  vatId: string;
  legalForm: string;
  tennisClubName: string;
  colorPrimary: string;
  colorCardStart: string;
  colorCardMid: string;
  colorCardEnd: string;
  logoStorageKey: string;
  stampStorageKey: string;
};

function stored(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function text(value: string | null | undefined, fallback: string) {
  return stored(value) || fallback;
}

function color(value: string | null | undefined, fallback: string) {
  const raw = stored(value);
  return HEX.test(raw) ? raw.toLowerCase() : fallback;
}

export function isHexColor(value: string) {
  return HEX.test(value.trim());
}

export function resolveClubBrand(
  club: { name: string; slug: string; settings: BrandSettings | null } | null,
): ClubBrand {
  const legacy = Boolean(club && isLegacyClub(club.slug));
  const settings = club?.settings ?? null;
  const clubName = stored(club?.name) || "Sportverein";
  const historic = legacy ? ASC_CLUB : null;
  const name = text(settings?.letterName, historic?.name ?? clubName);

  return {
    legacy,
    name,
    namePrimary: text(settings?.namePrimary, historic?.namePrimary ?? name),
    nameSecondary: text(settings?.nameSecondary, historic?.nameSecondary ?? ""),
    president: text(settings?.president, historic?.president ?? ""),
    street: text(settings?.street, historic?.street ?? ""),
    postalCode: text(settings?.postalCode, historic?.postalCode ?? ""),
    city: text(settings?.city, historic?.city ?? ""),
    province: text(settings?.province, historic?.province ?? ""),
    taxId: text(settings?.taxId, historic?.taxId ?? ""),
    vatId: text(settings?.vatId, historic?.vatId ?? ""),
    legalForm: stored(settings?.legalForm),
    tennisClubName: text(settings?.tennisClubName, historic?.tennisClubName ?? name),
    colorPrimary: color(settings?.colorPrimary, ASC_LAJEN.red),
    colorCardStart: color(settings?.colorCardStart, ASC_LAJEN.red),
    colorCardMid: color(settings?.colorCardMid, ASC_LAJEN.navy),
    colorCardEnd: color(settings?.colorCardEnd, ASC_LAJEN.green),
    logoUrl: clubLogoUrl(settings),
    stampUrl: clubStampUrl(settings),
  };
}

export function clubBrandAddressLine(brand: ClubBrand) {
  return [brand.street, [brand.postalCode, brand.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export const getClubBrand = cache(async () => {
  const club = await getCurrentClubRecord();
  return resolveClubBrand(club);
});
