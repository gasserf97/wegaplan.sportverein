"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  adminCancelReservationAction,
  createCourtAction,
  deleteCourtAction,
  toggleCourtBlockedAction,
  updateCourtPriceAction,
  updateCourtSectionAction,
  updateCourtCancelRefundMinutesAction,
  type CourtFormState,
} from "@/app/actions/reservations";
import {
  canCancelGuestReservation,
  formatCancelRefundMinutes,
} from "@/lib/court-booking";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";
import { formatDateTime, formatEuro } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellActions,
  tableHeadActions,
} from "@/components/ui/table";

type SectionOption = { id: string; name: string };

type CourtRow = {
  id: string;
  name: string;
  category: string;
  blocked: boolean;
  priceCentsPerHour: number;
  cancelRefundMinutesBeforeStart: number;
  sectionId: string | null;
  reservationCount: number;
  upcomingCount: number;
};

type ReservationRow = {
  id: string;
  courtName: string;
  userName: string;
  isGuest: boolean;
  guestEmail: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

const cellWrap =
  "max-w-none overflow-visible whitespace-normal align-top [&_*]:whitespace-normal";

export function AdminCourtsPanel({
  courts,
  reservations,
  sections,
}: {
  courts: CourtRow[];
  reservations: ReservationRow[];
  sections: SectionOption[];
}) {
  const [pending, start] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl text-primary">Plätze</h2>
          <Link
            href="/tennisplatz"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Kalender ansehen
          </Link>
        </div>

        <AddCourtForm sections={sections} />

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[64rem] table-auto">
            <TableHeader>
              <TableRow>
                <TableHead className={cellWrap}>Platz</TableHead>
                <TableHead className={cellWrap}>Kategorie</TableHead>
                <TableHead className={cellWrap}>Preis / Std.</TableHead>
                <TableHead className={cellWrap}>Storno mit Gutschrift</TableHead>
                <TableHead className={cellWrap}>Sektion (Buchhaltung)</TableHead>
                <TableHead className={cellWrap}>Status</TableHead>
                <TableHead className={cellWrap}>Reservierungen (7 Tage)</TableHead>
                <TableHead className={`${cellWrap} ${tableHeadActions}`}>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className={cellWrap}>
                    <p className="py-4 text-sm text-muted-foreground">
                      Noch keine Plätze angelegt.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                courts.map((court) => (
                  <TableRow key={court.id}>
                    <TableCell className={`${cellWrap} font-medium`}>
                      {court.name}
                    </TableCell>
                    <TableCell className={cellWrap}>{court.category}</TableCell>
                    <TableCell className={cellWrap}>
                      <CourtPriceField
                        courtId={court.id}
                        priceCentsPerHour={court.priceCentsPerHour}
                      />
                    </TableCell>
                    <TableCell className={cellWrap}>
                      <CourtCancelRefundField
                        courtId={court.id}
                        cancelRefundMinutesBeforeStart={
                          court.cancelRefundMinutesBeforeStart
                        }
                      />
                    </TableCell>
                    <TableCell className={cellWrap}>
                      <CourtSectionField
                        courtId={court.id}
                        sectionId={court.sectionId}
                        sections={sections}
                      />
                    </TableCell>
                    <TableCell className={cellWrap}>
                      <Badge variant={court.blocked ? "destructive" : "default"}>
                        {court.blocked ? "Gesperrt" : "Offen"}
                      </Badge>
                    </TableCell>
                    <TableCell className={cellWrap}>{court.reservationCount}</TableCell>
                    <TableCell className={`${cellWrap} ${tableCellActions}`}>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            start(async () => {
                              await toggleCourtBlockedAction(court.id);
                            });
                          }}
                        >
                          {court.blocked ? "Freigeben" : "Sperren"}
                        </Button>
                        <DeleteCourtButton
                          courtId={court.id}
                          canDelete={court.upcomingCount === 0}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Stundenpreis für Gäste und Mitglieder ohne Tennis-Saisonkarte. Saisonkarten-Inhaber
          spielen kostenlos.           „Storno mit Gutschrift“: Minuten vor Beginn, bis wann eine bezahlte
          Reservierung storniert werden kann. Rückerstattung abzüglich der
          Transaktionskosten (Standard: 120 Min. = 2 Stunden). Pro Platz kann eine Sektion für die Buchhaltung
          hinterlegt werden.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl text-primary">Anstehende Reservierungen</h2>
        {cancelError ? (
          <p className="mb-3 text-sm text-destructive">{cancelError}</p>
        ) : null}
        {reservations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine anstehenden Buchungen.</p>
        ) : (
          <ul className="grid gap-2">
            {reservations.map((item) => {
              const guestCanCancel =
                item.isGuest &&
                canCancelGuestReservation(new Date(item.startsAt));
              return (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.courtName}</span>
                    <span className="text-muted-foreground">·</span>
                    {item.isGuest ? (
                      <Badge variant="secondary">Gast</Badge>
                    ) : null}
                    <span>{item.userName}</span>
                  </div>
                  {item.isGuest && item.guestEmail ? (
                    <div className="text-muted-foreground">{item.guestEmail}</div>
                  ) : null}
                  <div className="text-muted-foreground">
                    {formatSlotDate(new Date(item.startsAt))} ·{" "}
                    {formatSlotTime(new Date(item.startsAt))}–
                    {formatSlotTime(new Date(item.endsAt))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Reserviert am {formatDateTime(new Date(item.createdAt))}
                  </div>
                  {item.isGuest && guestCanCancel ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Löschbar bis zum Vortag. Rückerstattung abzüglich
                      Transaktionskosten.
                    </div>
                  ) : null}
                  {item.isGuest && !guestCanCancel ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Am Tag der Reservierung nicht mehr löschbar.
                    </div>
                  ) : null}
                </div>
                {!item.isGuest || guestCanCancel ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (item.isGuest) {
                        const ok = window.confirm(
                          "Gast-Reservierung löschen? Rückerstattung abzüglich Transaktionskosten.",
                        );
                        if (!ok) return;
                      }
                      start(async () => {
                        setCancelError(null);
                        const result = await adminCancelReservationAction(item.id);
                        if ("error" in result) {
                          setCancelError(result.error);
                          return;
                        }
                        if (result.cardRefundCreditedCents > 0) {
                          window.alert(
                            `Die Rückerstattung auf die Karte ist fehlgeschlagen. ${formatEuro(result.cardRefundCreditedCents)} wurden als Guthaben gutgeschrieben.`,
                          );
                        }
                      });
                    }}
                  >
                    Stornieren
                  </Button>
                ) : null}
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddCourtForm({ sections }: { sections: SectionOption[] }) {
  const [state, formAction, pending] = useActionState<CourtFormState, FormData>(
    createCourtAction,
    null,
  );
  const draft = state && "error" in state ? state.fields : undefined;
  const formKey =
    state && "ok" in state
      ? "court-ok"
      : draft
        ? `court-${draft.name}-${draft.priceEuro}`
        : "court";

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_10rem_7rem_minmax(10rem,1fr)_auto] sm:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="court-name">Neuer Platz</Label>
        <Input
          id="court-name"
          name="name"
          defaultValue={draft?.name}
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="court-category">Kategorie</Label>
        <select
          id="court-category"
          name="category"
          defaultValue={draft?.category || "Freiluft"}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="Freiluft">Freiluft</option>
          <option value="Halle">Halle</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="court-price">Preis / Std. (€)</Label>
        <Input
          id="court-price"
          name="priceEuro"
          defaultValue={draft?.priceEuro ?? ""}
          inputMode="decimal"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="court-section">Sektion</Label>
        <select
          id="court-section"
          name="sectionId"
          defaultValue={draft?.sectionId || sections[0]?.id || ""}
          required
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending} className="sm:mb-0">
        {pending ? "Speichern…" : "Platz hinzufügen"}
      </Button>
      {state && "error" in state ? (
        <p className="text-sm text-destructive sm:col-span-full">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <p className="text-sm text-emerald-700 sm:col-span-full">Platz angelegt.</p>
      ) : null}
    </form>
  );
}

function CourtCancelRefundField({
  courtId,
  cancelRefundMinutesBeforeStart,
}: {
  courtId: string;
  cancelRefundMinutesBeforeStart: number;
}) {
  const [value, setValue] = useState(String(cancelRefundMinutesBeforeStart));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="grid gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const result = await updateCourtCancelRefundMinutesAction(courtId, value);
          if (result?.error) setError(result.error);
          else setSaved(true);
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8 w-16 shrink-0"
          inputMode="numeric"
          aria-label="Minuten vor Beginn für Storno mit Gutschrift"
        />
        <span className="text-xs text-muted-foreground">Min.</span>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "…" : "OK"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">
        bis {formatCancelRefundMinutes(Number(value) || 0)} vor Beginn
      </span>
      {saved ? <span className="text-xs text-muted-foreground">Gespeichert</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}

function CourtSectionField({
  courtId,
  sectionId,
  sections,
}: {
  courtId: string;
  sectionId: string | null;
  sections: SectionOption[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <select
        defaultValue={sectionId ?? sections[0]?.id ?? ""}
        disabled={pending || sections.length === 0}
        className="h-8 max-w-[12rem] rounded-lg border border-input bg-transparent px-2 text-sm"
        aria-label="Sektion"
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          setError(null);
          start(async () => {
            const result = await updateCourtSectionAction(courtId, value);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

function CourtPriceField({
  courtId,
  priceCentsPerHour,
}: {
  courtId: string;
  priceCentsPerHour: number;
}) {
  const [value, setValue] = useState((priceCentsPerHour / 100).toFixed(2));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        start(async () => {
          const result = await updateCourtPriceAction(courtId, value);
          if (result?.error) setError(result.error);
          else setSaved(true);
        });
      }}
    >
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 w-20 shrink-0"
        aria-label="Preis pro Stunde in Euro"
      />
      <span className="text-xs text-muted-foreground">€</span>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "…" : "OK"}
      </Button>
      {saved ? <span className="text-xs text-muted-foreground">Gespeichert</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}

function DeleteCourtButton({
  courtId,
  canDelete,
}: {
  courtId: string;
  canDelete: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
        disabled={pending || !canDelete}
        title={
          canDelete
            ? "Platz löschen"
            : "Löschen erst möglich, wenn keine Reservierung offen ist."
        }
        onClick={() => {
          if (!canDelete) return;
          if (!window.confirm("Platz wirklich löschen?")) return;
          setError(null);
          start(async () => {
            const result = await deleteCourtAction(courtId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Löschen…" : "Löschen"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
