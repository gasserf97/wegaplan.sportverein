import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClubBrandForm, ClubStampForm } from "@/components/club-brand-form";
import { ClubLogoForm } from "@/components/club-logo-form";
import { SectionSettingsGroup } from "@/components/section-admin";
import { ASC_LOGOS } from "@/lib/brand";
import { getClubBrand } from "@/lib/club-brand";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Verein" };

export default async function ClubAdminPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const brand = await getClubBrand();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-4xl text-primary">Verein</h1>
      <p className="mt-2 text-muted-foreground">
        Logo, Stempel, Adresse und Farben gelten für den ganzen Verein, nicht
        für eine einzelne Sektion.
      </p>

      <div className="mt-8 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <SectionSettingsGroup title="Logo">
          <ClubLogoForm logoUrl={brand.logoUrl} />
        </SectionSettingsGroup>
        <SectionSettingsGroup title="Stempel">
          <ClubStampForm
            stampUrl={brand.stampUrl}
            fallbackUrl={brand.legacy && !brand.stampUrl ? ASC_LOGOS.stamp : null}
          />
        </SectionSettingsGroup>
        <SectionSettingsGroup title="Angaben und Farben">
          <ClubBrandForm brand={brand} />
        </SectionSettingsGroup>
      </div>
    </div>
  );
}
