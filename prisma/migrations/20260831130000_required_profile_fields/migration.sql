-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "taxId" TEXT;

UPDATE "User"
SET "email" = 'mitglied-' || "id" || '@asclajen.local'
WHERE "email" IS NULL OR "email" = '';

UPDATE "User"
SET "phone" = '390' || SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 8)
WHERE "phone" IS NULL OR "phone" = '';

UPDATE "User"
SET "taxId" = UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 16))
WHERE "taxId" IS NULL OR "taxId" = '';

UPDATE "User"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "taxId" SET NOT NULL;

CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken");
