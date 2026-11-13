import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AdminTicketsList,
  type AdminTicketRow,
} from "@/components/admin-tickets-list";
import { requireAdmin } from "@/lib/auth";
import { getServerI18n } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return { title: t("admin.ticketsTitle") };
}

export default async function AdminTicketsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");

  const { t, locale } = await getServerI18n();

  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { name: true, email: true, username: true },
      },
      closedBy: {
        select: { name: true, username: true },
      },
    },
  });

  const rows: AdminTicketRow[] = tickets.map((ticket) => ({
    id: ticket.id,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null,
    closedBy: ticket.closedBy,
    user: ticket.user,
  }));

  const openTickets = rows.filter((ticket) => ticket.status === "OPEN");
  const closedTickets = rows.filter((ticket) => ticket.status === "CLOSED");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-4xl text-primary">{t("admin.ticketsTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("admin.ticketsDesc")}</p>
      </div>

      <AdminTicketsList
        openTickets={openTickets}
        closedTickets={closedTickets}
        locale={locale}
      />
    </div>
  );
}
