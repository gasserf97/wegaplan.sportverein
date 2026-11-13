-- AlterTable
ALTER TABLE "Section" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: aktuelle Namensreihenfolge als Startreihenfolge
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY name ASC) - 1)::integer AS rn
  FROM "Section"
)
UPDATE "Section" AS s
SET "sortOrder" = ordered.rn
FROM ordered
WHERE s.id = ordered.id;

-- CreateIndex
CREATE INDEX "Section_sortOrder_idx" ON "Section"("sortOrder");
