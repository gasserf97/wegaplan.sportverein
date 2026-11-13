import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AddFamilyMemberForm } from "@/components/family-forms";
import { FamilyMemberCard } from "@/components/family-member-card";
import { getCurrentUser } from "@/lib/auth";
import { canManageFamilyMembers, listFamily } from "@/lib/family";
import { formatBirthDate, toDateInputValue } from "@/lib/format";
import { getServerI18n } from "@/lib/i18n";
import { isProfileComplete } from "@/lib/profile";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("account.familyTitle") };
}

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string }>;
}) {
  const { locale, t } = await getServerI18n();
  const { added } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden?next=/konto/familie");

  const people = await listFamily(user.id);
  const self = people.find((person) => person.isSelf);
  const dependents = people.filter((person) => !person.isSelf);
  const canManage = await canManageFamilyMembers(user.id);
  const selfComplete = self
    ? isProfileComplete({
        name: self.name,
        phone: self.phone,
        taxId: self.taxId,
        street: self.street,
        postalCode: self.postalCode,
        city: self.city,
        birthDate: self.birthDate,
        email: self.email || user.email,
        canLogin: true,
      })
    : false;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {t("account.familyEyebrow")}
      </p>
      <h1 className="mt-2 text-4xl">{t("account.familyTitle")}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{t("account.familyDesc")}</p>
      {selfComplete ? (
        <Link href="/konto" className="mt-4 inline-block text-sm underline">
          {t("account.familyBack")}
        </Link>
      ) : null}

      {!selfComplete ? (
        <p className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {t("account.familyIncompleteBanner")}
        </p>
      ) : null}

      <div id="family-members-list" className="scroll-mt-6" />
      {added === "saved" || added === "invited" ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-800"
        >
          Familienmitglied gespeichert.
          {added === "invited"
            ? " Die Einladungs-E-Mail wurde gesendet."
            : ""}
        </p>
      ) : added === "invite-failed" ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          Familienmitglied gespeichert. Die Einladungs-E-Mail konnte nicht
          gesendet werden.
        </p>
      ) : null}

      {self ? (
        <section className="mt-10">
          <h2 className="text-2xl text-primary">{t("account.familySelfTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("account.familySelfHint")}
          </p>
          <div className="mt-4 min-w-0">
            <FamilyMemberCard
              memberId={self.id}
              name={self.name}
              email={self.email}
              phone={self.phone}
              taxId={self.taxId}
              street={self.street}
              postalCode={self.postalCode}
              city={self.city}
              birthDate={toDateInputValue(self.birthDate)}
              birthDateLabel={formatBirthDate(self.birthDate, locale)}
              age={self.age}
              emailVerified={self.emailVerified}
              hasMembership={self.hasMembership}
              isSelf
              canManage
              defaultOpen={!selfComplete}
            />
          </div>
        </section>
      ) : null}

      {dependents.length > 0 ? (
        <>
          <h2 className="mt-10 text-2xl">{t("account.familyDependents")}</h2>
          <ul className="mt-4 grid min-w-0 gap-4">
            {dependents.map((person) => (
              <li key={person.id} className="min-w-0">
                <FamilyMemberCard
                  memberId={person.id}
                  name={person.name}
                  email={person.email}
                  phone={person.phone}
                  taxId={person.taxId}
                  street={person.street}
                  postalCode={person.postalCode}
                  city={person.city}
                  birthDate={toDateInputValue(person.birthDate)}
                  birthDateLabel={formatBirthDate(person.birthDate, locale)}
                  age={person.age}
                  emailVerified={person.emailVerified}
                  hasMembership={person.hasMembership}
                  isSelf={false}
                  canLogin={person.canLogin}
                  canManage={canManage && selfComplete}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!canManage ? (
        <p className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          {t("account.familyManagedNotice")}
        </p>
      ) : !selfComplete ? (
        <p className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          {t("account.familyAddAfterSelf")}
        </p>
      ) : (
        <div className="mt-8 w-full">
          <AddFamilyMemberForm
            accountAddress={
              self?.street?.trim() &&
              self.postalCode?.trim() &&
              self.city?.trim()
                ? {
                    street: self.street,
                    postalCode: self.postalCode,
                    city: self.city,
                  }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
