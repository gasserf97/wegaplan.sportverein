-- AlterTable User: username, optional email, birthDate
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" TIMESTAMP(3);

UPDATE "User" SET "username" = LOWER(SPLIT_PART("email", '@', 1)), "birthDate" = '1990-01-01'::timestamp WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "birthDate" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable Section
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Section_name_key" ON "Section"("name");

-- CreateTable UserSection
CREATE TABLE "UserSection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "UserSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSection_userId_sectionId_key" ON "UserSection"("userId", "sectionId");

ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSection" ADD CONSTRAINT "UserSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable SectionAdmin
CREATE TABLE "SectionAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "SectionAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SectionAdmin_userId_sectionId_key" ON "SectionAdmin"("userId", "sectionId");

ALTER TABLE "SectionAdmin" ADD CONSTRAINT "SectionAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SectionAdmin" ADD CONSTRAINT "SectionAdmin_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Course
ALTER TABLE "Course" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "Course" ADD COLUMN "createdById" TEXT;

ALTER TABLE "Course" ADD CONSTRAINT "Course_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
