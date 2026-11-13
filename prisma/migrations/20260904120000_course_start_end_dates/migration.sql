-- Course period: start + end dates instead of free-text duration
ALTER TABLE "Course" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "Course" DROP COLUMN "duration";
