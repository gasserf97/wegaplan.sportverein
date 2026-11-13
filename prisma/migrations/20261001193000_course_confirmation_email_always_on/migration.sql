-- Einzahlungsbestätigung ist für Kurse immer aktiv.
UPDATE "Course" SET "sendConfirmationEmail" = true WHERE "sendConfirmationEmail" = false;

ALTER TABLE "Course" ALTER COLUMN "sendConfirmationEmail" SET DEFAULT true;
