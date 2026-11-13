"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellTruncate,
} from "@/components/ui/table";
import { TicketStatusButton } from "@/components/ticket-status-button";
import { TicketReplyButton } from "@/components/ticket-reply-button";
import { useI18n } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n/types";
import { ChevronDownIcon } from "lucide-react";

export type AdminTicketRow = {
  id: string;
  subject: string;
  message: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt: string | null;
  closedBy: { name: string; username: string } | null;
  user: { name: string; email: string; username: string };
};

function TicketTable({
  tickets,
  locale,
  showStatusToggle,
  showClosedMeta = false,
}: {
  tickets: AdminTicketRow[];
  locale: Locale;
  showStatusToggle: boolean;
  showClosedMeta?: boolean;
}) {
  const { t } = useI18n();

  if (tickets.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {t("admin.ticketsOpenEmpty")}
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{ticket.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(new Date(ticket.createdAt), locale)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                {ticket.status === "OPEN"
                  ? t("admin.ticketStatusOpen")
                  : t("admin.ticketStatusClosed")}
              </span>
            </div>
            <div className="text-sm">
              <p className="font-medium break-words">{ticket.user.name}</p>
              <p className="text-xs break-all text-muted-foreground">
                {ticket.user.email}
              </p>
            </div>
            <p className="rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-wrap">
              {ticket.message}
            </p>
            {showClosedMeta && ticket.closedAt && ticket.closedBy ? (
              <p className="text-xs text-muted-foreground">
                {t("admin.ticketClosedAt")}:{" "}
                {formatDateTime(new Date(ticket.closedAt), locale)} ·{" "}
                {t("admin.ticketClosedBy", { name: ticket.closedBy.name })}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <TicketReplyButton
                ticketId={ticket.id}
                recipientName={ticket.user.name}
                recipientEmail={ticket.user.email}
                subject={ticket.subject}
              />
              {showStatusToggle ? (
                <TicketStatusButton
                  ticketId={ticket.id}
                  status={ticket.status}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table layout="fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[6.75rem]">{t("common.date")}</TableHead>
              <TableHead className="w-[9rem]">
                {t("admin.ticketsUser")}
              </TableHead>
              <TableHead className="w-[9rem]">{t("support.subject")}</TableHead>
              {showClosedMeta ? (
                <TableHead className="w-[8.5rem]">
                  {t("admin.ticketClosedAt")}
                </TableHead>
              ) : null}
              <TableHead className="w-[4.5rem]">{t("common.status")}</TableHead>
              <TableHead className="w-[7.5rem]">
                {t("common.actions")}
              </TableHead>
              <TableHead>{t("support.message")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id} className="align-top">
                <TableCell className="text-xs whitespace-nowrap">
                  {formatDateTime(new Date(ticket.createdAt), locale)}
                </TableCell>
                <TableCell className={tableCellTruncate}>
                  <p className="truncate font-medium" title={ticket.user.name}>
                    {ticket.user.name}
                  </p>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={ticket.user.email}
                  >
                    {ticket.user.email}
                  </p>
                </TableCell>
                <TableCell className="break-words text-sm font-medium">
                  {ticket.subject}
                </TableCell>
                {showClosedMeta ? (
                  <TableCell className="text-xs">
                    {ticket.closedAt && ticket.closedBy ? (
                      <>
                        <p className="whitespace-nowrap">
                          {formatDateTime(new Date(ticket.closedAt), locale)}
                        </p>
                        <p
                          className="mt-0.5 truncate text-muted-foreground"
                          title={ticket.closedBy.name}
                        >
                          {t("admin.ticketClosedBy", {
                            name: ticket.closedBy.name,
                          })}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
                <TableCell className="text-xs">
                  {ticket.status === "OPEN"
                    ? t("admin.ticketStatusOpen")
                    : t("admin.ticketStatusClosed")}
                </TableCell>
                <TableCell>
                  <div className="grid gap-1.5">
                    <TicketReplyButton
                      ticketId={ticket.id}
                      recipientName={ticket.user.name}
                      recipientEmail={ticket.user.email}
                      subject={ticket.subject}
                    />
                    {showStatusToggle ? (
                      <TicketStatusButton
                        ticketId={ticket.id}
                        status={ticket.status}
                      />
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="break-words whitespace-pre-wrap text-sm">
                  {ticket.message}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function AdminTicketsList({
  openTickets,
  closedTickets,
  locale,
}: {
  openTickets: AdminTicketRow[];
  closedTickets: AdminTicketRow[];
  locale: Locale;
}) {
  const { t } = useI18n();

  if (openTickets.length === 0 && closedTickets.length === 0) {
    return (
      <p className="mt-8 rounded-2xl bg-card p-8 text-muted-foreground ring-1 ring-foreground/10">
        {t("admin.ticketsEmpty")}
      </p>
    );
  }

  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-2xl bg-card ring-1 ring-foreground/10">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium">{t("admin.ticketsOpen")}</h2>
          <p className="text-sm text-muted-foreground">
            {openTickets.length === 1
              ? t("admin.ticketsOpenCountOne")
              : t("admin.ticketsOpenCountMany", { n: openTickets.length })}
          </p>
        </div>
        <TicketTable tickets={openTickets} locale={locale} showStatusToggle />
      </section>

      {closedTickets.length > 0 ? (
        <details className="group rounded-2xl bg-card ring-1 ring-foreground/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-lg font-medium">
                {t("admin.ticketsClosed")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {closedTickets.length === 1
                  ? t("admin.ticketsClosedCountOne")
                  : t("admin.ticketsClosedCountMany", {
                      n: closedTickets.length,
                    })}
              </p>
            </div>
            <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <TicketTable
            tickets={closedTickets}
            locale={locale}
            showStatusToggle
            showClosedMeta
          />
        </details>
      ) : null}
    </div>
  );
}
