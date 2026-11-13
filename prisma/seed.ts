import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const adminHash = await hash("Admin1234", 10);
  const userHash = await hash("User1234", 10);
  const tennisHash = await hash("Tennis1234", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash: adminHash,
      role: "ADMIN",
      name: "Michael Prader",
      email: "admin@asclajen.com",
      phone: "+393471000001",
      taxId: "PRDMHL85C15H620A",
      street: "Kesselweg 8/B",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1985-03-15T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "admin",
      name: "Michael Prader",
      email: "admin@asclajen.com",
      phone: "+393471000001",
      taxId: "PRDMHL85C15H620A",
      street: "Kesselweg 8/B",
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
      name: "Tennis Sektion",
      email: "tennis@asclajen.com",
      phone: "+393471000003",
      taxId: "TNNSEC92S08H620C",
      street: "Tennisweg 1",
      postalCode: "39040",
      city: "Lajen",
      birthDate: new Date("1992-11-08T12:00:00.000Z"),
      emailVerifiedAt: new Date(),
    },
    create: {
      username: "tennis",
      name: "Tennis Sektion",
      email: "tennis@asclajen.com",
      phone: "+393471000003",
      taxId: "TNNSEC92S08H620C",
      street: "Tennisweg 1",
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
        "Sanfte Bewegung, bewusste Atmung und praktische Übungen für mehr Ruhe und Wohlbefinden. Geeignet für alle – ohne Leistungsdruck. Turnhalle Lajen.",
      priceCents: 10000,
      location: "Turnhalle Lajen",
      startsAt: new Date("2026-09-28T17:30:00.000Z"),
      endsAt: new Date("2026-12-07T17:30:00.000Z"),
      registrationDeadline: new Date("2026-09-20T12:00:00.000Z"),
      maxParticipants: 25,
      accent: "teal",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-kondition-damen",
      title: "Konditionsgymnastik für Damen",
      description:
        "Trainiert werden Ausdauer, Kraft, Bauch, Beine und Po. Referent: Reinhold Rogen. Mittwochs in der Turnhalle Lajen – ideal für Mitglieder der Sektion Freizeit Aktiv.",
      priceCents: 10000,
      location: "Turnhalle Lajen",
      startsAt: new Date("2026-10-07T17:15:00.000Z"),
      endsAt: new Date("2026-12-16T17:15:00.000Z"),
      registrationDeadline: new Date("2026-09-30T12:00:00.000Z"),
      audienceMinAge: 18,
      maxParticipants: 20,
      accent: "red",
      sectionId: freizeitSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-fussball",
      title: "Fußballschule 2026/2027",
      description:
        "Fußballschule für Jahrgänge 2020/21/22. Nur Training, keine Meisterschaftsspiele. Spielerisch Technik und Teamgeist fördern – Sektion Fußball ASC Lajen.",
      priceCents: 10000,
      location: "Sportplatz Lajen",
      startsAt: new Date("2026-04-16T08:00:00.000Z"),
      endsAt: new Date("2027-04-15T08:00:00.000Z"),
      registrationDeadline: new Date("2026-04-01T12:00:00.000Z"),
      audienceMaxAge: 8,
      maxParticipants: 30,
      accent: "navy",
      sectionId: fussballSection.id,
      createdById: admin.id,
    },
    {
      id: "kurs-dennis-sektion",
      title: "Tennistraining",
      description:
        "Wöchentliches Training der Sektion Tennis. Technik, Matchpraxis und Spiel auf den Plätzen in Lajen.",
      priceCents: 8000,
      location: "Tennisplätze Lajen",
      startsAt: new Date("2026-05-01T17:00:00.000Z"),
      endsAt: new Date("2026-06-26T17:00:00.000Z"),
      registrationDeadline: new Date("2026-04-20T12:00:00.000Z"),
      audienceMinAge: 10,
      audienceMaxAge: 18,
      maxParticipants: 12,
      accent: "green",
      sectionId: tennisSection.id,
      createdById: tennisAdmin.id,
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
      paidAt: new Date("2026-04-02T12:00:00.000Z"),
    },
    create: {
      userId: max.id,
      courseId: "kurs-yoga",
      status: "PAID",
      paidAt: new Date("2026-04-02T12:00:00.000Z"),
      purchasedById: max.id,
    },
  });

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: max.id, courseId: "kurs-dennis-sektion" } },
    update: {
      status: "PAID",
      paidAt: new Date("2026-05-10T16:00:00.000Z"),
    },
    create: {
      userId: max.id,
      courseId: "kurs-dennis-sektion",
      status: "PAID",
      paidAt: new Date("2026-05-10T16:00:00.000Z"),
      purchasedById: max.id,
    },
  });

  // Demo-Plätze/Fahrzeuge nur bei leerer Tabelle – nicht nach Admin-Löschungen neu anlegen.
  if ((await prisma.court.count()) === 0) {
    await prisma.court.createMany({
      data: [
        { id: "platz-1", name: "Platz 1", category: "Freiluft", sortOrder: 1, priceCentsPerHour: 1500 },
        { id: "platz-2", name: "Platz 2", category: "Freiluft", sortOrder: 2, priceCentsPerHour: 1500 },
        { id: "platz-3", name: "Platz 3", category: "Freiluft", sortOrder: 3, priceCentsPerHour: 1500 },
        { id: "platz-halle", name: "Halle", category: "Halle", sortOrder: 4, priceCentsPerHour: 2000 },
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
        },
      ],
    });
  }
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
