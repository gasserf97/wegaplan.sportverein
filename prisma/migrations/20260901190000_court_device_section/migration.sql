-- AlterTable
ALTER TABLE "Court" ADD COLUMN "sectionId" TEXT;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "sectionId" TEXT;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;
