-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarSyncTennis" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "calendarSyncCourses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "calendarSyncChildCourses" BOOLEAN NOT NULL DEFAULT true;
