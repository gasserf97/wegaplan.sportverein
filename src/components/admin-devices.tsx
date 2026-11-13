"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  adminCancelDeviceReservationAction,
  createDeviceAction,
  deleteDeviceAction,
  toggleDeviceBlockedAction,
  updateDeviceAction,
  updateDeviceSectionAction,
} from "@/app/actions/devices";
import { formatDevicePriceLabel, type DevicePricingMode } from "@/lib/device-booking";
import { formatSlotDate, formatSlotTime } from "@/lib/booking";
import { formatDateTime } from "@/lib/format";
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

type DeviceRow = {
  id: string;
  name: string;
  category: string;
  blocked: boolean;
  pricingMode: DevicePricingMode;
  priceCents: number;
  sectionId: string | null;
  reservationCount: number;
  upcomingCount: number;
};

type ReservationRow = {
  id: string;
  deviceName: string;
  userName: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  billingMode: DevicePricingMode;
  priceCents: number;
  reason: string;
};

export function AdminDevicesPanel({
  devices,
  reservations,
  sections,
}: {
  devices: DeviceRow[];
  reservations: ReservationRow[];
  sections: SectionOption[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    category: string;
    pricingMode: string;
    price: string;
    sectionId: string;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-2xl text-primary">Fahrzeug anlegen</h2>
        <form
          key={formKey}
          className="mt-4 grid gap-3 sm:grid-cols-2"
          action={(formData) => {
            setError(null);
            start(async () => {
              const result = await createDeviceAction(formData);
              if (result && "error" in result) {
                setError(result.error);
                setDraft(
                  result.fields ?? {
                    name: String(formData.get("name") ?? ""),
                    category: String(formData.get("category") ?? "Fahrzeug"),
                    pricingMode: String(formData.get("pricingMode") ?? "DAILY"),
                    price: String(formData.get("price") ?? ""),
                    sectionId: String(formData.get("sectionId") ?? ""),
                  },
                );
                setFormKey((key) => key + 1);
                return;
              }
              setDraft(null);
              setFormKey((key) => key + 1);
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={draft?.name}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Kategorie</Label>
            <Input
              id="category"
              name="category"
              defaultValue={draft?.category || "Fahrzeug"}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pricingMode">Preisart</Label>
            <select
              id="pricingMode"
              name="pricingMode"
              defaultValue={draft?.pricingMode || "DAILY"}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="DAILY">Pro Tag</option>
              <option value="HOURLY">Pro Stunde</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="price">Preis in Euro</Label>
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              defaultValue={draft?.price}
              required
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="device-section">Sektion</Label>
            <select
              id="device-section"
              name="sectionId"
              defaultValue={draft?.sectionId || sections[0]?.id || ""}
              required
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Speichern…" : "Fahrzeug anlegen"}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-2xl text-primary">Fuhrpark</h2>
          <Link
            href="/autos"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Fuhrpark-Kalender
          </Link>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Fahrzeug</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead>Preis</TableHead>
                <TableHead>Sektion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>7 Tage</TableHead>
                <TableHead className={tableHeadActions}>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Noch keine Fahrzeuge im Fuhrpark.
                  </TableCell>
                </TableRow>
              ) : (
                devices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.name}</TableCell>
                    <TableCell>{device.category}</TableCell>
                    <TableCell>
                      <DeviceEditForm device={device} />
                    </TableCell>
                    <TableCell>
                      <DeviceSectionField
                        deviceId={device.id}
                        sectionId={device.sectionId}
                        sections={sections}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={device.blocked ? "destructive" : "default"}>
                        {device.blocked ? "Gesperrt" : "Offen"}
                      </Badge>
                    </TableCell>
                    <TableCell>{device.reservationCount}</TableCell>
                    <TableCell className={tableCellActions}>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            start(async () => {
                              await toggleDeviceBlockedAction(device.id);
                            });
                          }}
                        >
                          {device.blocked ? "Freigeben" : "Sperren"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending || device.upcomingCount > 0}
                          onClick={() => {
                            start(async () => {
                              await deleteDeviceAction(device.id);
                            });
                          }}
                        >
                          Löschen
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Preisart umschalten: pro Stunde oder pro Tag. Pro Fahrzeug kann eine Sektion
          hinterlegt werden — bezahlte Reservierungen erscheinen in der Buchhaltung unter
          dieser Sektion.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl text-primary">Anstehende Reservierungen</h2>
        {reservations.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-muted-foreground">
            Keine anstehenden Reservierungen.
          </p>
        ) : (
          <ul className="grid gap-3">
            {reservations.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {item.deviceName} · {item.userName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatSlotDate(new Date(item.startsAt))} ·{" "}
                    {formatSlotTime(new Date(item.startsAt))}–
                    {formatSlotTime(new Date(item.endsAt))} ·{" "}
                    {item.billingMode === "DAILY" ? "Tag" : "Stunden"} ·{" "}
                    {(item.priceCents / 100).toFixed(2).replace(".", ",")} €
                  </p>
                  {item.reason ? (
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Reserviert am {formatDateTime(new Date(item.createdAt))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    start(async () => {
                      await adminCancelDeviceReservationAction(item.id);
                    });
                  }}
                >
                  Stornieren
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DeviceSectionField({
  deviceId,
  sectionId,
  sections,
}: {
  deviceId: string;
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
            const result = await updateDeviceSectionAction(deviceId, value);
            if (result && "error" in result) setError(result.error);
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

function DeviceEditForm({ device }: { device: DeviceRow }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="grid max-w-xs gap-2"
      action={(formData) => {
        setMessage(null);
        start(async () => {
          const result = await updateDeviceAction(device.id, formData);
          if (result && "error" in result) setMessage(result.error);
          else setMessage("Gespeichert");
        });
      }}
    >
      <input type="hidden" name="name" value={device.name} />
      <input type="hidden" name="category" value={device.category} />
      <input type="hidden" name="sectionId" value={device.sectionId ?? ""} />
      <select
        name="pricingMode"
        defaultValue={device.pricingMode}
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        <option value="DAILY">Pro Tag</option>
        <option value="HOURLY">Pro Stunde</option>
      </select>
      <Input
        name="price"
        inputMode="decimal"
        defaultValue={(device.priceCents / 100).toFixed(2).replace(".", ",")}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Preis speichern"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Aktuell: {formatDevicePriceLabel(device)}
        {message ? ` · ${message}` : null}
      </p>
    </form>
  );
}
