import { prisma } from "@/lib/prisma";
import { formatBirthDate } from "@/lib/format";
import {
  buildMembershipCardData,
  validityLabel,
  type MembershipCardData,
} from "@/lib/membership-card-data";
import { isMailConfigured, mailConfigIssue, sendMail } from "@/lib/mail";
import { resolveConfirmationDelivery } from "@/lib/notification-email";
import { getPublicAppUrl } from "@/lib/stripe";
import { ASC_LAJEN } from "@/lib/brand";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function membershipCardTableHtml(data: MembershipCardData) {
  const name = escapeHtml(data.name);
  const memberNo = escapeHtml(data.memberNo);
  const plan = escapeHtml(data.planTitle);
  const valid = escapeHtml(
    validityLabel(data.periodStart, data.periodEnd, data.interval).replace(
      /^gültig/,
      "Gültig",
    ),
  );
  const born = escapeHtml(formatBirthDate(data.birthDate));
  const logoUrl = `${getPublicAppUrl()}/asc-logo-icon.png`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:380px;margin:0 0 16px;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden;background:linear-gradient(160deg, ${ASC_LAJEN.red} 0%, ${ASC_LAJEN.navy} 55%, ${ASC_LAJEN.green} 100%);">
    <tr>
      <td style="padding:20px 20px 12px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:top;padding-right:12px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff;opacity:0.9;font-weight:bold;">ASC Lajen Raiffeisen</p>
              <p style="margin:6px 0 0;font-size:20px;font-weight:bold;line-height:1.25;color:#ffffff;">${escapeHtml(data.cardTitle)}</p>
            </td>
            <td style="width:42px;vertical-align:top;">
              <div style="width:42px;height:42px;background:#ffffff;border-radius:6px;padding:4px;box-sizing:border-box;">
                <img src="${escapeHtml(logoUrl)}" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border:0;" />
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 12px 12px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border-radius:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0;font-size:20px;font-weight:bold;color:${ASC_LAJEN.navy};">${name}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#666666;">Nr. ${memberNo} · geb. ${born}</p>
              <p style="margin:16px 0 0;font-size:14px;font-weight:bold;color:${ASC_LAJEN.green};">${plan}</p>
              <p style="margin:6px 0 0;font-size:13px;font-weight:bold;color:${ASC_LAJEN.dark};">${valid}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function membershipCardBlockText(data: MembershipCardData) {
  return [
    data.cardTitle,
    data.name,
    `Nr. ${data.memberNo}`,
    `geboren ${formatBirthDate(data.birthDate)}`,
    data.planTitle,
    validityLabel(data.periodStart, data.periodEnd, data.interval).replace(
      /^gültig/,
      "Gültig",
    ),
  ].join("\n");
}

export function membershipCardEmailHtml(
  cards: MembershipCardData | MembershipCardData[],
  cardUrl: string,
  options?: { recipientName?: string; intro?: string },
) {
  const list = Array.isArray(cards) ? cards : [cards];
  const greetingName = escapeHtml(
    options?.recipientName?.trim() || list[0]?.name || "",
  );
  const plural = list.length > 1;
  const introText =
    options?.intro ??
    (plural
      ? "die Vereinsmitgliedschaften sind bezahlt. Hier sind die digitalen Mitgliedskarten:"
      : "die Vereinsmitgliedschaft ist bezahlt. Hier ist Ihre digitale Mitgliedskarte:");

  return `<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#151515;">
  <p style="margin:0 0 16px;font-size:16px;">Guten Tag ${greetingName},</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
    ${escapeHtml(introText)}
  </p>
  ${list.map((data) => membershipCardTableHtml(data)).join("\n")}
  <p style="margin:20px 0 0;font-size:14px;">
    Karte${plural ? "n" : ""} im Konto öffnen oder drucken:<br />
    <a href="${escapeHtml(cardUrl)}" style="color:${ASC_LAJEN.teal};">${escapeHtml(cardUrl)}</a>
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#666;">ASC Lajen Raiffeisen</p>
</body>
</html>`;
}

export function membershipCardEmailText(
  cards: MembershipCardData | MembershipCardData[],
  cardUrl: string,
  options?: { recipientName?: string },
) {
  const list = Array.isArray(cards) ? cards : [cards];
  const greetingName = options?.recipientName?.trim() || list[0]?.name || "";
  const plural = list.length > 1;
  const intro = plural
    ? "die Vereinsmitgliedschaften sind bezahlt. Ihre Mitgliedskarten:"
    : "die Vereinsmitgliedschaft ist bezahlt. Ihre Mitgliedskarte:";

  return `Guten Tag ${greetingName},

${intro}

${list.map((data) => membershipCardBlockText(data)).join("\n\n---\n\n")}

Karte${plural ? "n" : ""} öffnen: ${cardUrl}

ASC Lajen Raiffeisen`;
}

export type MembershipCardSendResult =
  | { sent: true; alreadySent?: boolean }
  | { sent: false; message: string };

const membershipCardInclude = {
  plan: true,
  user: {
    select: {
      name: true,
      email: true,
      birthDate: true,
      managedBy: { select: { name: true, email: true } },
    },
  },
  purchasedBy: { select: { name: true, email: true } },
} as const;

type SubscriptionForCard = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.subscription.findUnique<{
        where: { id: string };
        include: typeof membershipCardInclude;
      }>
    >
  >
>;

function subscriptionDelivery(subscription: SubscriptionForCard) {
  return resolveConfirmationDelivery({
    memberEmail: subscription.user.email,
    memberName: subscription.user.name,
    purchaserEmail: subscription.purchasedBy?.email,
    purchaserName: subscription.purchasedBy?.name,
    managerEmail: subscription.user.managedBy?.email,
    managerName: subscription.user.managedBy?.name,
  });
}

function cardDataFor(
  subscription: SubscriptionForCard,
  options?: { periodStart?: Date | null; periodEnd?: Date | null },
) {
  return buildMembershipCardData({
    userId: subscription.userId,
    name: subscription.user.name,
    birthDate: subscription.user.birthDate,
    planTitle: subscription.plan.title,
    confirmationTitle: subscription.plan.confirmationTitle,
    periodStart: options?.periodStart ?? subscription.periodStart,
    periodEnd: options?.periodEnd ?? subscription.periodEnd,
    interval: subscription.plan.interval,
  });
}

async function sendMembershipCardGroup(
  rows: Array<{
    subscription: SubscriptionForCard;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    markSent?: boolean;
  }>,
): Promise<MembershipCardSendResult> {
  if (rows.length === 0) {
    return { sent: false, message: "Keine Vereinsmitgliedschaft gefunden." };
  }

  if (!isMailConfigured()) {
    const message =
      mailConfigIssue() ??
      "E-Mail-Versand ist nicht konfiguriert (SMTP in Render setzen).";
    console.error(
      "Mitgliedskarte E-Mail",
      rows.map((row) => row.subscription.id).join(","),
      message,
    );
    return { sent: false, message };
  }

  const deliveries = rows.map((row) => ({
    row,
    delivery: subscriptionDelivery(row.subscription),
  }));
  const primary =
    deliveries.find((item) => item.delivery?.isOwnMailbox)?.delivery ??
    deliveries[0]?.delivery;
  if (!primary) {
    const message =
      "Keine gültige Empfänger-E-Mail (ungültig oder .local-Adresse).";
    console.error(
      "Mitgliedskarte E-Mail",
      rows.map((row) => row.subscription.id).join(","),
      message,
    );
    return { sent: false, message };
  }

  const cards = rows.map((row) =>
    cardDataFor(row.subscription, {
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
    }),
  );
  const cardUrl = `${getPublicAppUrl()}/konto/mitgliedskarte`;
  const html = membershipCardEmailHtml(cards, cardUrl, {
    recipientName: primary.greetingName,
  });
  const text = membershipCardEmailText(cards, cardUrl, {
    recipientName: primary.greetingName,
  });
  const names = [...new Set(cards.map((card) => card.name))].join(", ");
  const subject =
    cards.length > 1
      ? `Vereinsmitgliedschaften für ${names} – ASC Lajen`
      : `Vereinsmitgliedschaft für ${names} – ASC Lajen`;

  try {
    const result = await sendMail({
      to: primary.email,
      subject,
      html,
      text,
    });
    if (!result.sent) {
      console.error("Mitgliedskarte E-Mail an", primary.email, result.message);
      return { sent: false, message: result.message };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Versandfehler.";
    console.error("Mitgliedskarte E-Mail an", primary.email, error);
    return { sent: false, message };
  }

  const sentAt = new Date();
  for (const row of rows) {
    if (row.markSent === false) continue;
    await prisma.subscription.update({
      where: { id: row.subscription.id },
      data: { membershipCardSentAt: sentAt },
    });
  }
  return { sent: true };
}

export async function sendMembershipCardForSubscription(
  subscriptionId: string,
  options?: {
    force?: boolean;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    markSent?: boolean;
  },
): Promise<MembershipCardSendResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: membershipCardInclude,
  });

  if (!subscription || subscription.plan.kind !== "MEMBERSHIP") {
    return { sent: false, message: "Keine Vereinsmitgliedschaft gefunden." };
  }

  if (subscription.membershipCardSentAt && !options?.force) {
    return { sent: true, alreadySent: true };
  }

  return sendMembershipCardGroup([
    {
      subscription,
      periodStart: options?.periodStart,
      periodEnd: options?.periodEnd,
      markSent: options?.markSent,
    },
  ]);
}

export type MembershipCardTarget = {
  subscriptionId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  force?: boolean;
};

/**
 * Mitgliedskarten pro Empfänger-Postfach bündeln:
 * – eigenes Konto → eigene Mail
 * – Kind ohne E-Mail → Karten gemeinsam an Mutter/Käufer
 */
export async function sendMembershipCardsForSubscriptions(
  targets: MembershipCardTarget[],
): Promise<void> {
  const unique = [
    ...new Map(targets.map((item) => [item.subscriptionId, item])).values(),
  ];
  if (unique.length === 0) return;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      id: { in: unique.map((item) => item.subscriptionId) },
      plan: { kind: "MEMBERSHIP" },
    },
    include: membershipCardInclude,
  });
  const byId = new Map(subscriptions.map((item) => [item.id, item]));

  const groups = new Map<
    string,
    Array<{
      subscription: SubscriptionForCard;
      periodStart?: Date | null;
      periodEnd?: Date | null;
      markSent?: boolean;
    }>
  >();

  for (const target of unique) {
    const subscription = byId.get(target.subscriptionId);
    if (!subscription) continue;
    if (subscription.membershipCardSentAt && !target.force) {
      console.info("Mitgliedskarte bereits gesendet", subscription.id);
      continue;
    }
    const delivery = subscriptionDelivery(subscription);
    if (!delivery) {
      console.error(
        "Mitgliedskarte E-Mail",
        subscription.id,
        "Keine gültige Empfänger-E-Mail (ungültig oder .local-Adresse).",
      );
      continue;
    }
    const list = groups.get(delivery.email) ?? [];
    list.push({
      subscription,
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
    });
    groups.set(delivery.email, list);
  }

  for (const [, group] of groups) {
    try {
      const result = await sendMembershipCardGroup(group);
      if (!result.sent) {
        console.error(
          "Mitgliedskarte E-Mail",
          group.map((row) => row.subscription.id).join(","),
          result.message,
        );
      }
    } catch (error) {
      console.error(
        "Mitgliedskarte E-Mail",
        group.map((row) => row.subscription.id).join(","),
        error,
      );
    }
  }
}
