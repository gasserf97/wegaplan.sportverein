"use client";

import { usePathname, useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/locale-provider";
import {
  ALL_SECTIONS_PARAM,
  isAllSectionsSelected,
  type SectionFilterOption,
} from "@/lib/section-filter";

export function SectionFilter({
  sections,
  selectedIds,
}: {
  sections: SectionFilterOption[];
  selectedIds: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const availableIds = sections.map((section) => section.id);
  const allSelected = isAllSectionsSelected(selectedIds, availableIds);
  const value =
    allSelected || selectedIds.length !== 1
      ? ALL_SECTIONS_PARAM
      : selectedIds[0];

  if (sections.length < 2) return null;

  function navigate(next: string) {
    const href =
      next === ALL_SECTIONS_PARAM
        ? pathname
        : `${pathname}?sektion=${encodeURIComponent(next)}`;
    router.push(href, { scroll: false });
  }

  return (
    <div className="mt-6 grid max-w-sm gap-2">
      <Label htmlFor="sektion-filter">{t("common.section")}</Label>
      <select
        id="sektion-filter"
        value={value}
        onChange={(event) => {
          navigate(event.target.value);
        }}
        className="h-11 rounded-lg border border-input bg-card px-3 text-sm font-medium shadow-sm ring-1 ring-foreground/10"
      >
        <option value={ALL_SECTIONS_PARAM}>
          {t("common.sectionFilterAll")}
        </option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>
    </div>
  );
}
