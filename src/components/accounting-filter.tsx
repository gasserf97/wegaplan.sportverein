"use client";

import { useRouter } from "next/navigation";
import {
  ALL_SECTIONS,
  ALL_TIME,
  ACCOUNTING_PERIOD_KEYS,
  accountingHref,
  type AccountingPeriodKey,
  type AccountingSection,
} from "@/lib/accounting-shared";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";

export function AccountingFilter({
  sections,
  selectedKey,
  selectedPeriod,
  allowClubWide,
  allowCombined,
  combinedLabel,
}: {
  sections: AccountingSection[];
  selectedKey: string;
  selectedPeriod: AccountingPeriodKey;
  allowClubWide: boolean;
  allowCombined: boolean;
  combinedLabel: string;
}) {
  const router = useRouter();
  const { t } = useI18n();

  function navigate(next: { sectionKey?: string; periodKey?: string }) {
    router.push(
      accountingHref({
        sectionKey: next.sectionKey ?? selectedKey,
        periodKey: next.periodKey ?? selectedPeriod,
      }),
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
      <div className="grid gap-2">
        <Label htmlFor="sektion">{t("accounting.filterSection")}</Label>
        <select
          id="sektion"
          value={selectedKey}
          onChange={(event) => {
            navigate({ sectionKey: event.target.value });
          }}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {allowCombined ? (
            <option value={ALL_SECTIONS}>
              {allowClubWide ? t("accounting.clubWide") : combinedLabel}
            </option>
          ) : null}
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="zeitraum">{t("accounting.filterPeriod")}</Label>
        <select
          id="zeitraum"
          value={selectedPeriod}
          onChange={(event) => {
            navigate({
              periodKey: event.target.value as AccountingPeriodKey,
            });
          }}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {ACCOUNTING_PERIOD_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`accounting.period.${key === ALL_TIME ? "all" : key}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
