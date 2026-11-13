/** Query-Wert, der ausdrücklich alle Sektionen meint. Fehlt der Parameter, gilt dasselbe. */
export const ALL_SECTIONS_PARAM = "alle";

export type SectionFilterOption = {
  id: string;
  name: string;
};

export function parseSelectedSectionIds(
  raw: string | undefined,
  availableIds: string[],
): string[] {
  if (!raw || raw === ALL_SECTIONS_PARAM) return [...availableIds];
  const allowed = new Set(availableIds);
  const picked: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!allowed.has(id) || picked.includes(id)) continue;
    picked.push(id);
  }
  if (picked.length === 0) return [...availableIds];
  return picked;
}

export function isAllSectionsSelected(
  selectedIds: string[],
  availableIds: string[],
) {
  if (availableIds.length === 0) return true;
  if (selectedIds.length !== availableIds.length) return false;
  const selected = new Set(selectedIds);
  return availableIds.every((id) => selected.has(id));
}

/**
 * `null` = keine zusätzliche Einschränkung.
 * `managedIds === null` heißt Haupt-Admin (alle Sektionen erlaubt).
 */
export function mergeSectionIds(
  managedIds: string[] | null,
  selectedIds: string[] | null,
): string[] | null {
  if (selectedIds === null) return managedIds;
  if (managedIds === null) return selectedIds;
  const allowed = new Set(managedIds);
  return selectedIds.filter((id) => allowed.has(id));
}

export function sectionIdWhere(ids: string[] | null) {
  if (ids === null) return {};
  return {
    sectionId: { in: ids.length > 0 ? ids : ["__none__"] },
  };
}

export function matchesSectionFilter(
  sectionId: string | null | undefined,
  selectedIds: string[],
  availableIds: string[],
) {
  if (isAllSectionsSelected(selectedIds, availableIds)) return true;
  return sectionId != null && selectedIds.includes(sectionId);
}
