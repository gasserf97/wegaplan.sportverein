import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

function daysFromNow(offsetDays: number, hourUtc = 17) {
  const date = new Date();
  date.setUTCHours(hourUtc, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

async function main() {
  const adminHash = await hash("Admin1234", 10);
  const userHash = await hash("User1234", 10);
  const tennisHash = await hash("Tennis1234", 10);
  const footballHash = await hash("Fussball1", 10);
  const annaHash = await hash("Anna1234", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminHash,
      role: "ADMIN",
      name: "Klara Leitner",
      email: "klara.leitner@example.com",
      phone: "+393470000001",
      taxId: "LTNKLR80A01H620X",
      street: "Musterweg 1",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1985-03-15T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "admin",
      name: "Klara Leitner",
      email: "klara.leitner@example.com",
      phone: "+393470000001",
      taxId: "LTNKLR80A01H620X",
      street: "Musterweg 1",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1985-03-15T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const max = await prisma.user.upsert({
    where: { username: "max" },
    update: {
      passwordHash: userHash,
      role: "USER",
      name: "Max Berger",
      email: "max@example.com",
      phone: "+393471000002",
      taxId: "BRGMAX98L22H620B",
      street: "Dorfstraße 12",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1998-07-22T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "max",
      name: "Max Berger",
      email: "max@example.com",
      phone: "+393471000002",
      taxId: "BRGMAX98L22H620B",
      street: "Dorfstraße 12",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1998-07-22T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: userHash,
      role: "USER",
    },
  });

  const existingDennis = await prisma.user.findUnique({ where: { username: "dennis" } });
  const existingTennisUser = await prisma.user.findUnique({ where: { username: "tennis" } });
  if (existingDennis && !existingTennisUser) {
    await prisma.user.update({
      where: { id: existingDennis.id },
      data: {
        username: "tennis",
        name: "Tennis Sektion",
        passwordHash: tennisHash,
      },
    });
  }

  const tennisAdmin = await prisma.user.upsert({
    where: { username: "tennis" },
    update: {
      passwordHash: tennisHash,
      name: "Lena Gruber",
      email: "lena.gruber@example.com",
      phone: "+393470000003",
      taxId: "GRBLNE92S41H620Y",
      street: "Platzweg 4",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1992-11-08T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "tennis",
      name: "Lena Gruber",
      email: "lena.gruber@example.com",
      phone: "+393470000003",
      taxId: "GRBLNE92S41H620Y",
      street: "Platzweg 4",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1992-11-08T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: tennisHash,
      role: "USER",
    },
  });

  const sectionNames = [
    { name: "Fußball", accent: "navy" },
    { name: "Freizeit Aktiv", accent: "teal" },
    { name: "Tennis", accent: "green" },
  ];
  const sections = [];
  for (let index = 0; index < sectionNames.length; index += 1) {
    const { name, accent } = sectionNames[index];
    const section = await prisma.section.upsert({
      where: { name },
      update: { sortOrder: index },
      create: { name, sortOrder: index, accent },
    });
    sections.push(section);
  }

  const fussballSection = sections.find((s) => s.name === "Fußball")!;
  const freizeitSection = sections.find((s) => s.name === "Freizeit Aktiv")!;
  let tennisSection = sections.find((s) => s.name === "Tennis")!;

  const dennisSection = await prisma.section.findUnique({ where: { name: "Dennis" } });
  if (dennisSection && tennisSection && dennisSection.id !== tennisSection.id) {
    await prisma.course.updateMany({
      where: { sectionId: dennisSection.id },
      data: { sectionId: tennisSection.id },
    });
    await prisma.subscriptionPlan.updateMany({
      where: { sectionId: dennisSection.id },
      data: { sectionId: tennisSection.id },
    });
    const dennisMembers = await prisma.userSection.findMany({
      where: { sectionId: dennisSection.id },
    });
    for (const member of dennisMembers) {
      await prisma.userSection.upsert({
        where: {
          userId_sectionId: { userId: member.userId, sectionId: tennisSection.id },
        },
        create: { userId: member.userId, sectionId: tennisSection.id },
        update: {},
      });
    }
    await prisma.userSection.deleteMany({ where: { sectionId: dennisSection.id } });
    const dennisAdmins = await prisma.sectionAdmin.findMany({
      where: { sectionId: dennisSection.id },
    });
    for (const adminRow of dennisAdmins) {
      await prisma.sectionAdmin.upsert({
        where: {
          userId_sectionId: { userId: adminRow.userId, sectionId: tennisSection.id },
        },
        create: { userId: adminRow.userId, sectionId: tennisSection.id },
        update: {},
      });
    }
    await prisma.sectionAdmin.deleteMany({ where: { sectionId: dennisSection.id } });
    await prisma.section.delete({ where: { id: dennisSection.id } });
  } else if (dennisSection && !tennisSection) {
    tennisSection = await prisma.section.update({
      where: { id: dennisSection.id },
      data: { name: "Tennis" },
    });
  }

  await prisma.userSection.upsert({
    where: { userId_sectionId: { userId: tennisAdmin.id, sectionId: tennisSection.id } },
    create: { userId: tennisAdmin.id, sectionId: tennisSection.id },
    update: {},
  });
  await prisma.sectionAdmin.upsert({
    where: { userId_sectionId: { userId: tennisAdmin.id, sectionId: tennisSection.id } },
    create: { userId: tennisAdmin.id, sectionId: tennisSection.id },
    update: {},
  });

  await prisma.userSection.upsert({
    where: { userId_sectionId: { userId: max.id, sectionId: freizeitSection.id } },
    create: { userId: max.id, sectionId: freizeitSection.id },
    update: {},
  });

  const courses = [
    {
      id: "kurs-yoga",
      title: "Somatic Yoga",
      description:
        "Beispielkurs: sanfte Bewegung und Atmung in der Turnhalle. Mittwochs, ohne Leistungsdruck, für alle Mitglieder.",
      priceCents: 9000,
      location: "Turnhalle Lajen",
      startsAt: daysFromNow(21, 17),
      endsAt: daysFromNow(90, 17),
      registrationDeadline: daysFromNow(14, 12),
      scheduleWeekdays: [3],
      scheduleStartMinute: 18 * 60,
      scheduleEndMinute: 19 * 60,
      maxParticipants: 16,
      accent: "teal",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-kondition-damen",
      title: "Konditionsgymnastik",
      description:
        "Beispielkurs der Sektion Freizeit Aktiv: Ausdauer und Kraft, dienstags in der Turnhalle. Ab 18 Jahren.",
      priceCents: 8000,
      location: "Turnhalle Lajen",
      startsAt: daysFromNow(16, 17),
      endsAt: daysFromNow(100, 17),
      registrationDeadline: daysFromNow(12, 12),
      scheduleWeekdays: [2],
      scheduleStartMinute: 19 * 60,
      scheduleEndMinute: 20 * 60,
      audienceMinAge: 18,
      maxParticipants: 20,
      accent: "red",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-fussball",
      title: "Fußball für Kinder",
      description:
        "Beispielkurs der Sektion Fußball: spielerisches Training für Kinder von 6 bis 12 Jahren. Samstags am Sportplatz, ohne Meisterschaft.",
      priceCents: 7000,
      location: "Sportplatz Lajen",
      startsAt: daysFromNow(10, 9),
      endsAt: daysFromNow(160, 9),
      registrationDeadline: daysFromNow(30, 12),
      scheduleWeekdays: [6],
      scheduleStartMinute: 10 * 60,
      scheduleEndMinute: 11 * 60 + 30,
      audienceMinAge: 6,
      audienceMaxAge: 12,
      maxParticipants: 18,
      accent: "navy",
      sectionId: fussballSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-dennis-sektion",
      title: "Tennistraining Jugend",
      description:
        "Beispielkurs der Sektion Tennis: Technik und Matchpraxis für 10- bis 18-Jährige auf den Plätzen in Lajen.",
      priceCents: 12000,
      location: "Tennisplätze Lajen",
      startsAt: daysFromNow(12, 16),
      endsAt: daysFromNow(80, 16),
      registrationDeadline: daysFromNow(20, 12),
      scheduleWeekdays: [4],
      scheduleStartMinute: 17 * 60,
      scheduleEndMinute: 18 * 60 + 30,
      audienceMinAge: 10,
      audienceMaxAge: 18,
      maxParticipants: 8,
      accent: "green",
      sectionId: tennisSection.id,
      createdById: tennisAdmin.id,
    },
    {
      id: "kurs-tennis-erwachsene",
      title: "Tennis für Erwachsene",
      description:
        "Beispielkurs: Matchtraining und Technik für Erwachsene ab 18. Dienstags auf den Plätzen in Lajen.",
      priceCents: 15000,
      location: "Tennisplätze Lajen",
      startsAt: daysFromNow(8, 18),
      endsAt: daysFromNow(70, 18),
      registrationDeadline: daysFromNow(18, 12),
      scheduleWeekdays: [2],
      scheduleStartMinute: 19 * 60,
      scheduleEndMinute: 20 * 60 + 30,
      audienceMinAge: 18,
      maxParticipants: 10,
      accent: "green",
      sectionId: tennisSection.id,
      createdById: tennisAdmin.id,
    },
    {
      id: "kurs-volleyball",
      title: "Volleyball Mixed",
      description:
        "Beispielkurs der Sektion Freizeit Aktiv: lockeres Mixed-Training, montags in der Turnhalle. Für Einsteiger und Freizeitspieler ab 16.",
      priceCents: 6000,
      location: "Turnhalle Lajen",
      startsAt: daysFromNow(7, 19),
      endsAt: daysFromNow(110, 19),
      registrationDeadline: daysFromNow(25, 12),
      scheduleWeekdays: [1],
      scheduleStartMinute: 20 * 60,
      scheduleEndMinute: 21 * 60 + 30,
      audienceMinAge: 16,
      maxParticipants: 14,
      accent: "teal",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-pilates",
      title: "Pilates",
      description:
        "Beispielkurs: Kräftigung und Beweglichkeit, donnerstags in der Turnhalle. Matte bitte mitbringen.",
      priceCents: 8500,
      location: "Turnhalle Lajen",
      startsAt: daysFromNow(11, 18),
      endsAt: daysFromNow(95, 18),
      registrationDeadline: daysFromNow(16, 12),
      scheduleWeekdays: [4],
      scheduleStartMinute: 18 * 60 + 30,
      scheduleEndMinute: 19 * 60 + 30,
      audienceMinAge: 16,
      maxParticipants: 12,
      accent: "red",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-kinderturnen",
      title: "Kinderturnen",
      description:
        "Beispielkurs: Spiele, Balancieren und erste Geräte für Kinder von 4 bis 7 Jahren. Freitags in der Turnhalle.",
      priceCents: 5000,
      location: "Turnhalle Lajen",
      startsAt: daysFromNow(9, 15),
      endsAt: daysFromNow(120, 15),
      registrationDeadline: daysFromNow(28, 12),
      scheduleWeekdays: [5],
      scheduleStartMinute: 16 * 60,
      scheduleEndMinute: 17 * 60,
      audienceMinAge: 4,
      audienceMaxAge: 7,
      maxParticipants: 12,
      accent: "teal",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-fussball-jugend",
      title: "Fußball Jugend",
      description:
        "Beispielkurs der Sektion Fußball: Technik und Spielformen für 13- bis 17-Jährige. Mittwochs am Sportplatz.",
      priceCents: 9000,
      location: "Sportplatz Lajen",
      startsAt: daysFromNow(6, 17),
      endsAt: daysFromNow(150, 17),
      registrationDeadline: daysFromNow(22, 12),
      scheduleWeekdays: [3],
      scheduleStartMinute: 17 * 60,
      scheduleEndMinute: 18 * 60 + 30,
      audienceMinAge: 13,
      audienceMaxAge: 17,
      maxParticipants: 20,
      accent: "navy",
      sectionId: fussballSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-langlauf",
      title: "Langlauf Einstieg",
      description:
        "Beispielkurs: klassische Technik für Einsteiger ab 14 Jahren. Sonntags, Treffpunkt beim Sportplatz. Eigene Ausrüstung.",
      priceCents: 7500,
      location: "Loipe bei Lajen",
      startsAt: daysFromNow(18, 9),
      endsAt: daysFromNow(60, 9),
      registrationDeadline: daysFromNow(14, 12),
      scheduleWeekdays: [7],
      scheduleStartMinute: 9 * 60,
      scheduleEndMinute: 11 * 60,
      audienceMinAge: 14,
      maxParticipants: 15,
      accent: "navy",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
  ];

  for (const course of courses) {
    const { id, ...data } = course;
    await prisma.course.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.enrollment.deleteMany({
    where: { courseId: { in: ["kurs-tennis", "kurs-mitgliedschaft"] } },
  });
  await prisma.course.deleteMany({
    where: { id: { in: ["kurs-tennis", "kurs-mitgliedschaft"] } },
  });

  const plans = [
    {
      id: "abo-mitgliedschaft",
      title: "Vereinsmitgliedschaft",
      description:
        "Schritt 1: Mitgliedsbeitrag für den ASC Lajen Raiffeisen. Der Preis richtet sich nach dem Alter (Geburtsdatum). Ohne gültige Mitgliedschaft können Sie keine Kurse buchen und keine Tennis-Saisonkarte kaufen. Optional jährlich automatisch verlängern.",
      priceCents: 1200,
      childPriceCents: 600,
      childMaxAge: 18,
      interval: "YEARLY_ROLLING" as const,
      kind: "MEMBERSHIP" as const,
      location: "ASC Lajen",
      accent: "green",
      autoRenewOffered: true,
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "abo-tennis-saison",
      title: "Tennis Saisonkarte",
      description:
        "Saisonkarte für Vereinsmitglieder inkl. Meisterschaft/Tennismannschaft. Erwachsene und Kinder zahlen den Einzelpreis. Bei 2 Erwachsenen und 1 Kind unter 18 Jahren greift automatisch die Familienkarte; zusätzliche Personen werden einzeln berechnet.",
      priceCents: 10000,
      childPriceCents: 5000,
      childMaxAge: 18,
      pricingMode: "FAMILY_BUNDLE" as const,
      familyPriceCents: 22000,
      familyAdults: 2,
      familyChildren: 1,
      interval: "YEARLY_ROLLING" as const,
      kind: "ADDON" as const,
      location: "Tennisplätze Lajen",
      accent: "green",
      autoRenewOffered: true,
      sectionId: tennisSection.id,
      createdById: admin.id,
    },
    {
      id: "abo-fussball-jahr",
      title: "Fußball Jahresbeitrag",
      description:
        "Beispiel: Sektionsbeitrag Fußball für Training und Freundschaftsspiele. Kinder bis 18 Jahre zahlen den ermäßigten Preis.",
      priceCents: 8000,
      childPriceCents: 4000,
      childMaxAge: 18,
      interval: "YEARLY_ROLLING" as const,
      kind: "ADDON" as const,
      location: "Sportplatz Lajen",
      accent: "navy",
      autoRenewOffered: true,
      sectionId: fussballSection.id,
      createdById: admin.id,
    },
    {
      id: "abo-freizeit-karte",
      title: "Freizeit Aktiv Karte",
      description:
        "Beispiel: Jahreskarte für alle Kurse der Sektion Freizeit Aktiv. Gilt zusätzlich zur Vereinsmitgliedschaft.",
      priceCents: 14000,
      childPriceCents: 7000,
      childMaxAge: 18,
      interval: "YEARLY_ROLLING" as const,
      kind: "ADDON" as const,
      location: "Turnhalle Lajen",
      accent: "teal",
      autoRenewOffered: true,
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "abo-tennis-winter",
      title: "Tennis Winterkarte",
      description:
        "Beispiel: monatliche Hallen- und Platzkarte der Sektion Tennis von November bis März. Nur für Vereinsmitglieder.",
      priceCents: 3500,
      interval: "MONTHLY" as const,
      kind: "ADDON" as const,
      location: "Tennishalle Lajen",
      accent: "green",
      autoRenewOffered: false,
      sectionId: tennisSection.id,
      createdById: tennisAdmin.id,
    },
    {
      id: "abo-kinder-sport",
      title: "Kinder-Sportpass",
      description:
        "Beispiel: Zusatzpass für Kinder von 4 bis 12 Jahren. Deckt Kinderturnen und Fußball für Kinder in dieser Saison.",
      priceCents: 6000,
      audienceMinAge: 4,
      audienceMaxAge: 12,
      interval: "YEARLY_ROLLING" as const,
      kind: "ADDON" as const,
      location: "ASC Lajen",
      accent: "red",
      autoRenewOffered: false,
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
  ];

  for (const plan of plans) {
    const { id, ...data } = plan;
    await prisma.subscriptionPlan.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.subscription.deleteMany({
    where: { planId: "abo-tennis-familienkarte" },
  });
  await prisma.subscriptionPlan.deleteMany({
    where: { id: "abo-tennis-familienkarte" },
  });

  const membershipPlanId = "abo-mitgliedschaft";
  const otherMemberships = await prisma.subscription.findMany({
    where: {
      userId: max.id,
      planId: membershipPlanId,
      NOT: { id: "demo-sub-max-member" },
    },
    select: { id: true },
  });

  if (otherMemberships.length > 0) {
    // Real purchase exists — do not keep a second seeded membership with fake dates.
    await prisma.subscription.deleteMany({ where: { id: "demo-sub-max-member" } });
  } else {
    const membershipPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: membershipPlanId },
      select: { priceCents: true },
    });
    const paidCents = membershipPlan?.priceCents ?? 1200;
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    const placeholderStart = new Date("2026-03-15T10:00:00.000Z");
    const placeholderEnd = new Date("2027-03-15T10:00:00.000Z");
    const existingDemo = await prisma.subscription.findUnique({
      where: { id: "demo-sub-max-member" },
    });
    const isPlaceholder =
      !existingDemo ||
      existingDemo.periodStart?.getTime() === placeholderStart.getTime() ||
      existingDemo.periodEnd?.getTime() === placeholderEnd.getTime();

    if (!existingDemo) {
      await prisma.subscription.create({
        data: {
          id: "demo-sub-max-member",
          userId: max.id,
          planId: membershipPlanId,
          status: "ACTIVE",
          paymentMethod: "STRIPE",
          stripeSessionId: "cs_test_seed_max_member",
          paidCents,
          paidAt: periodStart,
          periodStart,
          periodEnd,
          purchasedById: max.id,
        },
      });
    } else if (isPlaceholder) {
      await prisma.subscription.update({
        where: { id: "demo-sub-max-member" },
        data: {
          status: "ACTIVE",
          paymentMethod: "STRIPE",
          stripeSessionId: "cs_test_seed_max_member",
          paidCents,
          paidAt: periodStart,
          periodStart,
          periodEnd,
        },
      });
    }
  }

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: max.id, courseId: "kurs-yoga" } },
    update: {
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_max_yoga",
      paidCents: 9000,
      stripeFeeCents: 160,
      paidAt: daysFromNow(-20, 10),
    },
    create: {
      userId: max.id,
      courseId: "kurs-yoga",
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_max_yoga",
      paidCents: 9000,
      stripeFeeCents: 160,
      paidAt: daysFromNow(-20, 10),
      purchasedById: max.id,
    },
  });

  const anna = await prisma.user.upsert({
    where: { username: "anna" },
    update: {
      passwordHash: annaHash,
      role: "USER",
      name: "Anna Holzer",
      email: "anna.holzer@example.com",
      phone: "+393470000004",
      taxId: "HLZNNA95M45H620Z",
      street: "Bergstraße 9",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1995-08-05T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "anna",
      name: "Anna Holzer",
      email: "anna.holzer@example.com",
      phone: "+393470000004",
      taxId: "HLZNNA95M45H620Z",
      street: "Bergstraße 9",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1995-08-05T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: annaHash,
      role: "USER",
    },
  });

  const footballAdmin = await prisma.user.upsert({
    where: { username: "fussball" },
    update: {
      passwordHash: footballHash,
      role: "USER",
      name: "Paul Senoner",
      email: "paul.senoner@example.com",
      phone: "+393470000005",
      taxId: "SNNPLA88D12H620W",
      street: "Kirchplatz 2",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1988-04-12T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      canBookDevices: true,
    },
    create: {
      username: "fussball",
      name: "Paul Senoner",
      email: "paul.senoner@example.com",
      phone: "+393470000005",
      taxId: "SNNPLA88D12H620W",
      street: "Kirchplatz 2",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1988-04-12T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: footballHash,
      role: "USER",
      canBookDevices: true,
    },
  });

  const mia = await prisma.user.upsert({
    where: { username: "mia" },
    update: {
      name: "Mia Berger",
      email: "mia.berger@example.com",
      phone: "+393470000002",
      taxId: "BRGMIA16E02H620Q",
      street: "Dorfstraße 12",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("2016-05-02T12:00:00.000Z"),
      canLogin: false,
      managedById: max.id,
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "mia",
      name: "Mia Berger",
      email: "mia.berger@example.com",
      phone: "+393470000002",
      taxId: "BRGMIA16E02H620Q",
      street: "Dorfstraße 12",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("2016-05-02T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
      passwordHash: userHash,
      role: "USER",
      canLogin: false,
      managedById: max.id,
    },
  });

  await prisma.userSection.upsert({
    where: { userId_sectionId: { userId: anna.id, sectionId: fussballSection.id } },
    create: { userId: anna.id, sectionId: fussballSection.id },
    update: {},
  });
  await prisma.userSection.upsert({
    where: { userId_sectionId: { userId: footballAdmin.id, sectionId: fussballSection.id } },
    create: { userId: footballAdmin.id, sectionId: fussballSection.id },
    update: {},
  });
  await prisma.sectionAdmin.upsert({
    where: { userId_sectionId: { userId: footballAdmin.id, sectionId: fussballSection.id } },
    create: { userId: footballAdmin.id, sectionId: fussballSection.id },
    update: {},
  });

  async function ensureMembership(id: string, userId: string, payerId: string) {
    const periodStart = daysFromNow(-40, 9);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    await prisma.subscription.upsert({
      where: { id },
      update: {
        status: "ACTIVE",
        paymentMethod: "STRIPE",
        stripeSessionId: `cs_test_seed_${id}`,
        paidCents: 1200,
        paidAt: periodStart,
        periodStart,
        periodEnd,
      },
      create: {
        id,
        userId,
        planId: membershipPlanId,
        status: "ACTIVE",
        paymentMethod: "STRIPE",
        stripeSessionId: `cs_test_seed_${id}`,
        paidCents: 1200,
        paidAt: periodStart,
        periodStart,
        periodEnd,
        purchasedById: payerId,
      },
    });
    const paymentId = `pi_test_seed_${id}`;
    const existingPayment = await prisma.subscriptionPayment.findFirst({
      where: { subscriptionId: id, stripePaymentId: paymentId },
    });
    if (!existingPayment) {
      await prisma.subscriptionPayment.create({
        data: {
          subscriptionId: id,
          amountCents: 1200,
          source: "demo",
          paidAt: periodStart,
          stripePaymentId: paymentId,
          stripeFeeCents: 43,
        },
      });
    }
  }

  await ensureMembership("demo-sub-anna-member", anna.id, anna.id);
  await ensureMembership("demo-sub-lena-member", tennisAdmin.id, tennisAdmin.id);
  await ensureMembership("demo-sub-paul-member", footballAdmin.id, footballAdmin.id);
  await ensureMembership("demo-sub-mia-member", mia.id, max.id);

  const seasonStart = daysFromNow(-15, 11);
  const seasonEnd = new Date(seasonStart);
  seasonEnd.setUTCFullYear(seasonEnd.getUTCFullYear() + 1);
  await prisma.subscription.upsert({
    where: { id: "demo-sub-max-tennis" },
    update: {
      status: "ACTIVE",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_max_tennis",
      paidCents: 10000,
      paidAt: seasonStart,
      periodStart: seasonStart,
      periodEnd: seasonEnd,
    },
    create: {
      id: "demo-sub-max-tennis",
      userId: max.id,
      planId: "abo-tennis-saison",
      status: "ACTIVE",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_max_tennis",
      paidCents: 10000,
      paidAt: seasonStart,
      periodStart: seasonStart,
      periodEnd: seasonEnd,
      purchasedById: max.id,
    },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: mia.id, courseId: "kurs-fussball" } },
    update: {
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_mia_fussball",
      paidCents: 7000,
      stripeFeeCents: 130,
      paidAt: daysFromNow(-5, 15),
      purchasedById: max.id,
    },
    create: {
      userId: mia.id,
      courseId: "kurs-fussball",
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_mia_fussball",
      paidCents: 7000,
      stripeFeeCents: 130,
      paidAt: daysFromNow(-5, 15),
      purchasedById: max.id,
    },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: anna.id, courseId: "kurs-kondition-damen" } },
    update: {
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_anna_gym",
      paidCents: 8000,
      stripeFeeCents: 145,
      paidAt: daysFromNow(-3, 18),
    },
    create: {
      userId: anna.id,
      courseId: "kurs-kondition-damen",
      status: "PAID",
      paymentMethod: "STRIPE",
      stripeSessionId: "cs_test_seed_anna_gym",
      paidCents: 8000,
      stripeFeeCents: 145,
      paidAt: daysFromNow(-3, 18),
      purchasedById: anna.id,
    },
  });

  // Demo-Plätze/Fahrzeuge nur bei leerer Tabelle – nicht nach Admin-Löschungen neu anlegen.
  if ((await prisma.court.count()) === 0) {
    await prisma.court.createMany({
      data: [
        { id: "platz-1", name: "Platz 1", category: "Freiluft", sortOrder: 1, priceCentsPerHour: 1500, sectionId: tennisSection.id },
        { id: "platz-2", name: "Platz 2", category: "Freiluft", sortOrder: 2, priceCentsPerHour: 1500, sectionId: tennisSection.id },
        { id: "platz-3", name: "Platz 3", category: "Freiluft", sortOrder: 3, priceCentsPerHour: 1500, sectionId: tennisSection.id },
        { id: "platz-halle", name: "Halle", category: "Halle", sortOrder: 4, priceCentsPerHour: 2000, sectionId: tennisSection.id },
      ],
    });
  }

  if ((await prisma.device.count()) === 0) {
    await prisma.device.createMany({
      data: [
        {
          id: "auto-1",
          name: "Vereinsauto 1",
          category: "Fahrzeug",
          sortOrder: 1,
          pricingMode: "DAILY",
          priceCents: 5000,
        },
        {
          id: "auto-2",
          name: "Vereinsauto 2",
          category: "Fahrzeug",
          sortOrder: 2,
          pricingMode: "HOURLY",
          priceCents: 1500,
          sectionId: freizeitSection.id,
        },
      ],
    });
  }

  await prisma.court.updateMany({
    where: { sectionId: null },
    data: { sectionId: tennisSection.id },
  });
  await prisma.device.updateMany({
    where: { sectionId: null },
    data: { sectionId: freizeitSection.id },
  });

  await prisma.enrollment.deleteMany({
    where: { userId: max.id, courseId: "kurs-dennis-sektion" },
  });

  const courtStart = daysFromNow(2, 16);
  const courtEnd = new Date(courtStart.getTime() + 60 * 60 * 1000);
  if (await prisma.court.findUnique({ where: { id: "platz-1" } })) {
  await prisma.courtReservation.upsert({
    where: { id: "demo-res-max-court" },
    update: {
      startsAt: courtStart,
      endsAt: courtEnd,
      status: "CONFIRMED",
      paidAt: daysFromNow(-1, 12),
      priceCents: 1500,
      stripeFeeCents: 48,
      stripeSessionId: "cs_test_seed_max_court",
    },
    create: {
      id: "demo-res-max-court",
      courtId: "platz-1",
      userId: max.id,
      label: "Training Max Berger",
      startsAt: courtStart,
      endsAt: courtEnd,
      status: "CONFIRMED",
      paidAt: daysFromNow(-1, 12),
      priceCents: 1500,
      stripeFeeCents: 48,
      stripeSessionId: "cs_test_seed_max_court",
    },
  });
  }

  const driveStart = daysFromNow(5, 8);
  const driveEnd = daysFromNow(5, 18);
  if (await prisma.device.findUnique({ where: { id: "auto-2" } })) {
  await prisma.deviceReservation.upsert({
    where: { id: "demo-res-paul-auto" },
    update: {
      startsAt: driveStart,
      endsAt: driveEnd,
      status: "CONFIRMED",
      paidAt: daysFromNow(-2, 9),
      priceCents: 1500,
      stripeFeeCents: 48,
      stripeSessionId: "cs_test_seed_paul_auto",
      reason: "Materialtransport zum Sportplatz",
    },
    create: {
      id: "demo-res-paul-auto",
      deviceId: "auto-2",
      userId: footballAdmin.id,
      startsAt: driveStart,
      endsAt: driveEnd,
      billingMode: "HOURLY",
      reason: "Materialtransport zum Sportplatz",
      status: "CONFIRMED",
      paidAt: daysFromNow(-2, 9),
      priceCents: 1500,
      stripeFeeCents: 48,
      stripeSessionId: "cs_test_seed_paul_auto",
    },
  });
  }

  await prisma.clubEvent.upsert({
    where: { id: "demo-event-abend" },
    update: {
      body: "Beispiel: Vereinsabend in der Turnhalle. Alle Mitglieder sind eingeladen, Anmeldung ist nicht nötig.",
      startsAt: daysFromNow(-1, 0),
      endsAt: daysFromNow(21, 22),
      audienceAll: true,
    },
    create: {
      id: "demo-event-abend",
      body: "Beispiel: Vereinsabend in der Turnhalle. Alle Mitglieder sind eingeladen, Anmeldung ist nicht nötig.",
      startsAt: daysFromNow(-1, 0),
      endsAt: daysFromNow(21, 22),
      audienceAll: true,
      createdById: admin.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
