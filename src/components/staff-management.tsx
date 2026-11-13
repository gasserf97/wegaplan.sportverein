"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import { startImpersonationAction } from "@/app/actions/impersonation";
import {
  deleteUserAction,
  setCanBookDevicesAction,
  setGlobalAdminAction,
  setSectionAdminsAction,
} from "@/app/actions/members";
import { EditMemberForm } from "@/components/edit-member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellActions,
  tableCellTruncate,
  tableHeadActions,
} from "@/components/ui/table";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey =
  | "name"
  | "email"
  | "birthDate"
  | "createdAt"
  | "lastClient"
  | "admin"
  | "sectionAdmin"
  | "club"
  | "tennis"
  | "fleet";

type SortDir = "asc" | "desc";

export type StaffMember = {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  street: string;
  postalCode: string;
  city: string;
  emailVerified: boolean;
  birthDate: string;
  birthDateInput: string;
  createdAt: string;
  role: "USER" | "ADMIN";
  canLogin: boolean;
  sectionAdminIds: string[];
  hasClubMembership: boolean;
  hasTennisMembership: boolean;
  canBookDevices: boolean;
  dependentCount: number;
  /** Nur gesetzt, wenn die Liste ein Haupt-Admin sieht. */
  lastClient: "PWA" | "BROWSER" | null;
};

export type SectionOption = {
  id: string;
  name: string;
};

function formatBirthDate(iso: string) {
  return formatShortDate(new Date(iso));
}

function formatRegisteredAt(iso: string) {
  return formatShortDate(new Date(iso));
}

function clientChannelLabel(channel: StaffMember["lastClient"]) {
  if (channel === "PWA") return "Web-App";
  if (channel === "BROWSER") return "Browser";
  return "—";
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function memberMatchesQuery(member: StaffMember, query: string) {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearch(
    [
      member.name,
      member.username,
      member.email,
      member.phone,
      member.phone.replace(/\D/g, ""),
      member.taxId,
      member.street,
      member.postalCode,
      member.city,
    ].join(" "),
  );
  return tokens.every((token) => haystack.includes(token));
}

function compareText(a: string, b: string) {
  const aValue = a.trim();
  const bValue = b.trim();
  if (!aValue && bValue) return 1;
  if (aValue && !bValue) return -1;
  return aValue.localeCompare(bValue, "de", { sensitivity: "base" });
}

function compareBoolean(a: boolean, b: boolean) {
  return Number(a) - Number(b);
}

function sectionAdminSortLabel(
  member: StaffMember,
  sections: SectionOption[],
) {
  return sections
    .filter((section) => member.sectionAdminIds.includes(section.id))
    .map((section) => section.name)
    .join(", ");
}

function compareMembers(
  a: StaffMember,
  b: StaffMember,
  key: SortKey,
  sections: SectionOption[],
) {
  switch (key) {
    case "name":
      return compareText(a.name, b.name) || compareText(a.username, b.username);
    case "email":
      return compareText(a.email, b.email) || compareText(a.name, b.name);
    case "birthDate":
      return (
        new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime() ||
        compareText(a.name, b.name)
      );
    case "createdAt":
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        compareText(a.name, b.name)
      );
    case "lastClient":
      return (
        compareText(
          clientChannelLabel(a.lastClient),
          clientChannelLabel(b.lastClient),
        ) || compareText(a.name, b.name)
      );
    case "admin":
      return (
        compareBoolean(a.role === "ADMIN", b.role === "ADMIN") ||
        compareText(a.name, b.name)
      );
    case "sectionAdmin":
      return (
        compareText(
          sectionAdminSortLabel(a, sections),
          sectionAdminSortLabel(b, sections),
        ) || compareText(a.name, b.name)
      );
    case "club":
      return (
        compareBoolean(a.hasClubMembership, b.hasClubMembership) ||
        compareText(a.name, b.name)
      );
    case "tennis":
      return (
        compareBoolean(a.hasTennisMembership, b.hasTennisMembership) ||
        compareText(a.name, b.name)
      );
    case "fleet":
      return (
        compareBoolean(
          a.canBookDevices || a.role === "ADMIN",
          b.canBookDevices || b.role === "ADMIN",
        ) || compareText(a.name, b.name)
      );
  }
}

function SortableHead({
  label,
  column,
  activeKey,
  direction,
  onSort,
  className,
  title,
}: {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  direction: SortDir;
  onSort: (column: SortKey) => void;
  className?: string;
  title?: string;
}) {
  const active = activeKey === column;
  const Icon = !active
    ? ArrowUpDownIcon
    : direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon;

  const centered = className?.includes("text-center");

  return (
    <TableHead
      className={className}
      title={title}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          centered ? "justify-center" : "text-left",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate">{label}</span>
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </TableHead>
  );
}

export function StaffManagement({
  members,
  sections,
  currentAdminId,
  currentAdminAddress,
  readOnly = false,
}: {
  members: StaffMember[];
  sections: SectionOption[];
  currentAdminId: string;
  currentAdminAddress: {
    street: string;
    postalCode: string;
    city: string;
  } | null;
  readOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterClub, setFilterClub] = useState(false);
  const [filterTennis, setFilterTennis] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const showClientChannel = !readOnly;
  const columnCount = 9 + (readOnly ? 0 : 1) + (showClientChannel ? 1 : 0);
  const adminCount = useMemo(
    () => members.filter((member) => member.role === "ADMIN").length,
    [members],
  );

  function handleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDir("asc");
  }

  const filteredMembers = useMemo(() => {
    const filtered = members.filter((member) => {
      if (!memberMatchesQuery(member, query)) return false;
      if (filterClub && !member.hasClubMembership) return false;
      if (filterTennis && !member.hasTennisMembership) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const result = compareMembers(a, b, sortKey, sections);
      return sortDir === "asc" ? result : -result;
    });
    return sorted;
  }, [members, query, filterClub, filterTennis, sortKey, sortDir, sections]);

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <label className="block max-w-md">
          <span className="sr-only">Mitglieder suchen</span>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium">Filter:</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterClub}
              onChange={(event) => setFilterClub(event.target.checked)}
              className="size-4 accent-primary"
            />
            Sportvereinsmitglied
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterTennis}
              onChange={(event) => setFilterTennis(event.target.checked)}
              className="size-4 accent-primary"
            />
            Tennismitglied
          </label>
          <span className="text-muted-foreground">
            {filteredMembers.length} von {members.length} Personen
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Name"
                column="name"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="E-Mail"
                column="email"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                className={tableCellTruncate}
              />
              <SortableHead
                label="Geburtsdatum"
                column="birthDate"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Registriert am"
                column="createdAt"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              {showClientChannel ? (
                <SortableHead
                  label="Zugang"
                  column="lastClient"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={handleSort}
                  className="whitespace-nowrap"
                  title="Zuletzt geöffneter Zugang. Erscheint nach der nächsten Anmeldung oder dem nächsten Besuch."
                />
              ) : null}
              <SortableHead
                label="Haupt-Admin"
                column="admin"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortableHead
                label="Sektionsadmin"
                column="sectionAdmin"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                className="min-w-[12rem]"
              />
              <SortableHead
                label="Sportverein"
                column="club"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                className="text-center"
              />
              <SortableHead
                label="Tennis"
                column="tennis"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                className="text-center"
              />
              <SortableHead
                label="Fuhrpark"
                column="fleet"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                className="text-center"
              />
              {!readOnly ? (
                <TableHead className={tableHeadActions}>Aktionen</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="p-8 text-sm text-muted-foreground"
                >
                  Keine Mitglieder für diese Suche.
                </TableCell>
              </TableRow>
            ) : null}
            {filteredMembers.map((member) => {
              const sectionAdminNames = sections
                .filter((section) => member.sectionAdminIds.includes(section.id))
                .map((section) => section.name);
              return (
              <Fragment key={member.id}>
                <TableRow>
                  <TableCell>
                    <span className="font-medium">{member.name}</span>
                    {member.role === "ADMIN" ? (
                      <Badge className="ml-2" variant="default">
                        Admin
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className={tableCellTruncate} title={member.email}>
                    <span className="text-sm">{member.email || "—"}</span>
                    {!member.canLogin ? (
                      <Badge className="ml-2" variant="secondary">
                        kein Zugang
                      </Badge>
                    ) : null}
                    {member.canLogin && !member.emailVerified ? (
                      <Badge className="ml-2" variant="secondary">
                        unbestätigt
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatBirthDate(member.birthDate)}</TableCell>
                  <TableCell title={formatDateTime(new Date(member.createdAt))}>
                    {formatRegisteredAt(member.createdAt)}
                  </TableCell>
                  {showClientChannel ? (
                    <TableCell className="whitespace-nowrap">
                      {clientChannelLabel(member.lastClient)}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {readOnly ? (
                      member.role === "ADMIN" ? "Ja" : "Nein"
                    ) : (
                      <GlobalAdminToggle
                        userId={member.id}
                        isAdmin={member.role === "ADMIN"}
                        disabled={
                          member.id === currentAdminId && member.role === "ADMIN"
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {readOnly ? (
                      <span className="text-sm text-muted-foreground">
                        {sectionAdminNames.length > 0
                          ? sectionAdminNames.join(", ")
                          : "—"}
                      </span>
                    ) : (
                      <SectionAdminMultiSelect
                        key={`${member.id}-${member.sectionAdminIds.join(",")}`}
                        userId={member.id}
                        sections={sections}
                        selectedIds={member.sectionAdminIds}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <MembershipBadge active={member.hasClubMembership} />
                  </TableCell>
                  <TableCell className="text-center">
                    <MembershipBadge active={member.hasTennisMembership} />
                  </TableCell>
                  <TableCell className="text-center">
                    {readOnly ? (
                      member.canBookDevices || member.role === "ADMIN"
                        ? "Ja"
                        : "Nein"
                    ) : (
                      <CanBookDevicesToggle
                        userId={member.id}
                        allowed={member.canBookDevices || member.role === "ADMIN"}
                        disabled={member.role === "ADMIN"}
                      />
                    )}
                  </TableCell>
                  {!readOnly ? (
                    <TableCell className={tableCellActions}>
                      <div className="flex flex-wrap justify-end gap-2">
                        {member.id !== currentAdminId &&
                        member.role !== "ADMIN" ? (
                          <ImpersonateMemberButton
                            userId={member.id}
                            name={member.name}
                          />
                        ) : null}
                        <Button
                          type="button"
                          variant={editingId === member.id ? "secondary" : "outline"}
                          size="sm"
                          onClick={() =>
                            setEditingId((current) =>
                              current === member.id ? null : member.id,
                            )
                          }
                        >
                          {editingId === member.id ? "Schließen" : "Bearbeiten"}
                        </Button>
                        <DeleteMemberButton
                          userId={member.id}
                          name={member.name}
                          disabledReason={
                            member.id === currentAdminId
                              ? "Sie können Ihr eigenes Konto nicht löschen."
                              : member.dependentCount > 0
                                ? "Zuerst die Familienmitglieder löschen."
                                : member.role === "ADMIN" && adminCount <= 1
                                  ? "Der letzte Haupt-Admin kann nicht gelöscht werden."
                                  : null
                          }
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
                {!readOnly && editingId === member.id ? (
                  <TableRow>
                    <TableCell colSpan={columnCount} className="bg-muted/30 p-5">
                      <EditMemberForm
                        userId={member.id}
                        name={member.name}
                        email={member.email}
                        phone={member.phone}
                        taxId={member.taxId}
                        street={member.street}
                        postalCode={member.postalCode}
                        city={member.city}
                        birthDate={member.birthDateInput}
                        canLogin={member.canLogin}
                        allowNoPlatformAccess={
                          member.id !== currentAdminId &&
                          member.role !== "ADMIN"
                        }
                        accountAddress={currentAdminAddress}
                        onSaved={() => setEditingId(null)}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MembershipBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "default" : "secondary"}>
      {active ? "Ja" : "Nein"}
    </Badge>
  );
}

function ImpersonateMemberButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1 justify-items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        title={`App als ${name} ansehen`}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await startImpersonationAction(userId);
            if (result && "error" in result) setError(result.error);
          });
        }}
      >
        {pending ? "…" : "Simulieren"}
      </Button>
      {error ? (
        <p className="max-w-48 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function DeleteMemberButton({
  userId,
  name,
  disabledReason,
}: {
  userId: string;
  name: string;
  disabledReason: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const disabled = Boolean(disabledReason);

  return (
    <div className="grid gap-1 justify-items-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending || disabled}
        title={disabledReason ?? undefined}
        onClick={() => {
          if (
            !window.confirm(
              `${name} wirklich löschen? Kurse, Mitgliedschaften, Guthaben und Reservierungen dieser Person entfallen dauerhaft.`,
            )
          ) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await deleteUserAction(userId);
            if (result && "error" in result) setError(result.error);
          });
        }}
      >
        {pending ? "Löschen…" : "Löschen"}
      </Button>
      {error ? (
        <p className="max-w-48 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function GlobalAdminToggle({
  userId,
  isAdmin,
  disabled,
}: {
  userId: string;
  isAdmin: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant={isAdmin ? "default" : "outline"}
      size="sm"
      disabled={pending || disabled}
      onClick={() => {
        start(async () => {
          await setGlobalAdminAction(userId, !isAdmin);
        });
      }}
    >
      {isAdmin ? "Ja" : "Nein"}
    </Button>
  );
}

function CanBookDevicesToggle({
  userId,
  allowed,
  disabled,
}: {
  userId: string;
  allowed: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      variant={allowed ? "default" : "outline"}
      size="sm"
      disabled={pending || disabled}
      title={
        disabled
          ? "Haupt-Admins dürfen immer reservieren."
          : "Recht zur Fahrzeugreservierung"
      }
      onClick={() => {
        start(async () => {
          await setCanBookDevicesAction(userId, !allowed);
        });
      }}
    >
      {allowed ? "Ja" : "Nein"}
    </Button>
  );
}

function SectionAdminMultiSelect({
  userId,
  sections,
  selectedIds,
}: {
  userId: string;
  sections: SectionOption[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localIds, setLocalIds] = useState(selectedIds);

  const selectedNames = sections
    .filter((section) => localIds.includes(section.id))
    .map((section) => section.name);

  function toggle(sectionId: string) {
    const next = localIds.includes(sectionId)
      ? localIds.filter((id) => id !== sectionId)
      : [...localIds, sectionId];
    setLocalIds(next);
    setError(null);
    start(async () => {
      const result = await setSectionAdminsAction(userId, next);
      if (result && "error" in result) {
        setError(result.error);
        setLocalIds(selectedIds);
      }
    });
  }

  return (
    <div className="relative min-w-[10rem]">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full min-h-9 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left text-xs",
          pending && "opacity-60",
        )}
      >
        <span className="line-clamp-2">
          {selectedNames.length > 0 ? selectedNames.join(", ") : "Keine"}
        </span>
        <span className="shrink-0 text-muted-foreground">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-border bg-card p-2 shadow-md">
          {sections.map((section) => {
            const checked = localIds.includes(section.id);
            return (
              <label
                key={section.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending}
                  onChange={() => toggle(section.id)}
                  className="size-4 accent-primary"
                />
                {section.name}
              </label>
            );
          })}
          <button
            type="button"
            className="mt-1 w-full rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Schließen
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
