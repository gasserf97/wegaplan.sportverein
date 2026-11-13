-- AlterTable
ALTER TABLE "Course" ADD COLUMN "registrationDeadline" TIMESTAMP(3),
ADD COLUMN "audienceMinAge" INTEGER,
ADD COLUMN "audienceMaxAge" INTEGER,
ADD COLUMN "maxParticipants" INTEGER;
