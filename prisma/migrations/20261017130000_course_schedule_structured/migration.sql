-- Freitext durch Wochentag und Uhrzeit ersetzen (Kalender braucht feste Zeiten).
ALTER TABLE "Course" DROP COLUMN IF EXISTS "schedule";
ALTER TABLE "Course" ADD COLUMN "scheduleWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "Course" ADD COLUMN "scheduleStartMinute" INTEGER;
ALTER TABLE "Course" ADD COLUMN "scheduleEndMinute" INTEGER;
