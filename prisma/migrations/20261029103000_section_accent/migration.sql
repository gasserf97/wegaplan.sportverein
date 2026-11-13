-- Kartenfarbe gilt für die Sektion, nicht mehr einzeln pro Kurs.
ALTER TABLE "Section" ADD COLUMN "accent" TEXT NOT NULL DEFAULT 'red';

UPDATE "Section" AS s
SET "accent" = mapped.accent
FROM (
  SELECT ranked."sectionId",
    CASE ranked.accent
      WHEN 'rust' THEN 'red'
      WHEN 'olive' THEN 'green'
      WHEN 'ink' THEN 'navy'
      WHEN 'clay' THEN 'teal'
      WHEN 'gold' THEN 'green'
      WHEN 'red' THEN 'red'
      WHEN 'green' THEN 'green'
      WHEN 'teal' THEN 'teal'
      WHEN 'navy' THEN 'navy'
      WHEN 'dark' THEN 'dark'
      ELSE 'red'
    END AS accent
  FROM (
    SELECT "sectionId", accent,
      ROW_NUMBER() OVER (
        PARTITION BY "sectionId"
        ORDER BY COUNT(*) DESC, accent
      ) AS rn
    FROM "Course"
    WHERE "sectionId" IS NOT NULL
    GROUP BY "sectionId", accent
  ) AS ranked
  WHERE ranked.rn = 1
) AS mapped
WHERE s.id = mapped."sectionId";

UPDATE "Course" AS c
SET "accent" = s."accent"
FROM "Section" AS s
WHERE c."sectionId" = s.id;
