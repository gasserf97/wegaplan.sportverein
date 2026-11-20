import { redirect } from "next/navigation";
import { setPlatformTicketStatusAction } from "@/app/actions/platform-tickets";
import { PlatformTicketReplyForm } from "@/components/platform-ticket-reply-form";
import { getPlatformAdmin } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlatformTicketsPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/vereine");

  const tickets = await prisma.supportTicket.findMany({
    where: { forwardedAt: { not: null } },
    orderBy: { forwardedAt: "desc" },
    include: {
      club: { select: { name: true } },
      user: { select: { name: true, email: true } },
      forwardedBy: { select: { name: true } },
      platformReplies: { orderBy: { createdAt: "asc" } },
    },
  });

  const openTickets = tickets.filter((ticket) => ticket.platformStatus === "OPEN");
  const closedTickets = tickets.filter(
    (ticket) => ticket.platformStatus === "CLOSED",
  );

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-12">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Betreiber
        </p>
        <h1 className="mt-2 text-4xl">Tickets</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tickets, die Vereine an wegaPlan weitergeleitet haben.
        </p>
      </div>

      {tickets.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Noch kein Verein hat ein Ticket weitergeleitet.
        </p>
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-3">
            <h2 className="text-lg font-medium">
              Offen{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {openTickets.length}
              </span>
            </h2>
            {openTickets.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                Keine offenen weitergeleiteten Tickets.
              </p>
            ) : (
              <ul className="grid gap-3">
                {openTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            )}
          </section>

          {closedTickets.length > 0 ? (
            <details className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="font-medium">
                  Erledigt{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {closedTickets.length}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground group-open:hidden">
                  Anzeigen
                </span>
              </summary>
              <ul className="grid gap-3 border-t border-border p-3">
                {closedTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </main>
  );
}

function TicketCard({
  ticket,
}: {
  ticket: {
    id: string;
    subject: string;
    message: string;
    forwardNote: string;
    forwardedAt: Date | null;
    platformStatus: "OPEN" | "CLOSED";
    platformClosedAt: Date | null;
    club: { name: string };
    user: { name: string; email: string };
    forwardedBy: { name: string } | null;
    platformReplies: {
      id: string;
      body: string;
      authorName: string;
      createdAt: Date;
    }[];
  };
}) {
  const forwardedAt = ticket.forwardedAt ?? new Date();
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">
            {ticket.club.name}
          </p>
          <p className="mt-1 font-medium break-words">{ticket.subject}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Weitergeleitet {formatDateTime(forwardedAt, "de")}
            {ticket.forwardedBy ? ` von ${ticket.forwardedBy.name}` : ""}
          </p>
        </div>
        <form action={setPlatformTicketStatusAction}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input
            type="hidden"
            name="status"
            value={ticket.platformStatus === "OPEN" ? "CLOSED" : "OPEN"}
          />
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm"
          >
            {ticket.platformStatus === "OPEN" ? "Erledigt" : "Wieder öffnen"}
          </button>
        </form>
      </div>
      <p className="mt-3 text-sm">
        <span className="font-medium">{ticket.user.name}</span>
        <span className="text-muted-foreground"> · {ticket.user.email}</span>
      </p>
      <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm break-words whitespace-pre-wrap">
        {ticket.message}
      </p>
      {ticket.forwardNote ? (
        <p className="mt-3 text-sm break-words whitespace-pre-wrap">
          <span className="font-medium">Hinweis des Vereins: </span>
          {ticket.forwardNote}
        </p>
      ) : null}
      {ticket.platformReplies.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {ticket.platformReplies.map((reply) => (
            <li
              key={reply.id}
              className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
            >
              <p className="text-xs font-medium text-primary">
                Antwort an den Verein · {formatDateTime(reply.createdAt, "de")} ·{" "}
                {reply.authorName}
              </p>
              <p className="mt-1 break-words whitespace-pre-wrap">{reply.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        <PlatformTicketReplyForm
          key={ticket.platformReplies.length}
          ticketId={ticket.id}
        />
      </div>
      {ticket.platformStatus === "CLOSED" && ticket.platformClosedAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Erledigt {formatDateTime(ticket.platformClosedAt, "de")}
        </p>
      ) : null}
    </li>
  );
}
