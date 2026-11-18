-- Vereine: eine Installation, Daten pro Verein getrennt.

CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

CREATE TABLE "ClubHost" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    CONSTRAINT "ClubHost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubHost_host_key" ON "ClubHost"("host");
CREATE INDEX "ClubHost_clubId_idx" ON "ClubHost"("clubId");

ALTER TABLE "ClubHost"
ADD CONSTRAINT "ClubHost_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_username_key" ON "PlatformAdmin"("username");
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

CREATE TABLE "ClubSettings" (
    "clubId" TEXT NOT NULL,
    "mailProvider" TEXT NOT NULL DEFAULT '',
    "mailFrom" TEXT NOT NULL DEFAULT '',
    "brevoApiKey" TEXT NOT NULL DEFAULT '',
    "resendApiKey" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" TEXT NOT NULL DEFAULT '',
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "registrationBackupEmail" TEXT NOT NULL DEFAULT '',
    "supportTicketNotifyEmail" TEXT NOT NULL DEFAULT '',
    "stripeFeePercent" TEXT NOT NULL DEFAULT '',
    "stripeFeeFixedCents" TEXT NOT NULL DEFAULT '',
    "showcaseMode" BOOLEAN NOT NULL DEFAULT false,
    "impressumUrl" TEXT NOT NULL DEFAULT '',
    "configuredAt" TIMESTAMP(3),
    CONSTRAINT "ClubSettings_pkey" PRIMARY KEY ("clubId")
);

ALTER TABLE "ClubSettings"
ADD CONSTRAINT "ClubSettings_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Club" ("id", "name", "slug", "active", "createdAt")
VALUES ('club_lajen', 'ASC Lajen Raiffeisen', 'lajen', true, CURRENT_TIMESTAMP);

INSERT INTO "ClubHost" ("id", "clubId", "host")
VALUES ('host_app_asclajen', 'club_lajen', 'app.asclajen.com');

INSERT INTO "ClubSettings" ("clubId", "impressumUrl")
VALUES ('club_lajen', 'https://asclajen.com/impressum');

ALTER TABLE "User" ADD COLUMN "clubId" TEXT;
UPDATE "User" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "User"
ADD CONSTRAINT "User_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "User_username_key";
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_clubId_username_key" ON "User"("clubId", "username");
CREATE UNIQUE INDEX "User_clubId_email_key" ON "User"("clubId", "email");
CREATE INDEX "User_clubId_idx" ON "User"("clubId");

ALTER TABLE "Section" ADD COLUMN "clubId" TEXT;
UPDATE "Section" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "Section" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "Section"
ADD CONSTRAINT "Section_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "Section_name_key";
DROP INDEX "Section_paymentEnvKey_key";
CREATE UNIQUE INDEX "Section_clubId_name_key" ON "Section"("clubId", "name");
CREATE UNIQUE INDEX "Section_clubId_paymentEnvKey_key" ON "Section"("clubId", "paymentEnvKey");
CREATE INDEX "Section_clubId_idx" ON "Section"("clubId");

ALTER TABLE "Course" ADD COLUMN "clubId" TEXT;
UPDATE "Course" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "Course" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "Course"
ADD CONSTRAINT "Course_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Course_clubId_idx" ON "Course"("clubId");

ALTER TABLE "Court" ADD COLUMN "clubId" TEXT;
UPDATE "Court" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "Court" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "Court"
ADD CONSTRAINT "Court_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Court_clubId_idx" ON "Court"("clubId");

ALTER TABLE "Device" ADD COLUMN "clubId" TEXT;
UPDATE "Device" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "Device" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "Device"
ADD CONSTRAINT "Device_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Device_clubId_idx" ON "Device"("clubId");

ALTER TABLE "SubscriptionPlan" ADD COLUMN "clubId" TEXT;
UPDATE "SubscriptionPlan" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "SubscriptionPlan"
ADD CONSTRAINT "SubscriptionPlan_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SubscriptionPlan_clubId_idx" ON "SubscriptionPlan"("clubId");

ALTER TABLE "SupportTicket" ADD COLUMN "clubId" TEXT;
UPDATE "SupportTicket" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "SupportTicket" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "SupportTicket"
ADD CONSTRAINT "SupportTicket_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SupportTicket_clubId_idx" ON "SupportTicket"("clubId");

ALTER TABLE "ClubEvent" ADD COLUMN "clubId" TEXT;
UPDATE "ClubEvent" SET "clubId" = 'club_lajen' WHERE "clubId" IS NULL;
ALTER TABLE "ClubEvent" ALTER COLUMN "clubId" SET NOT NULL;
ALTER TABLE "ClubEvent"
ADD CONSTRAINT "ClubEvent_clubId_fkey"
FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ClubEvent_clubId_idx" ON "ClubEvent"("clubId");

CREATE TABLE "SectionPaymentConfig" (
    "sectionId" TEXT NOT NULL,
    "bankAccountHolder" TEXT NOT NULL DEFAULT '',
    "bankIban" TEXT NOT NULL DEFAULT '',
    "stripeSecretKey" TEXT NOT NULL DEFAULT '',
    "stripeWebhookSecret" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SectionPaymentConfig_pkey" PRIMARY KEY ("sectionId")
);

ALTER TABLE "SectionPaymentConfig"
ADD CONSTRAINT "SectionPaymentConfig_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;
