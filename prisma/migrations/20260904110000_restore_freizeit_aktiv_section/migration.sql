-- Restore section if the previous cleanup already ran on a database.
INSERT INTO "Section" ("id", "name", "createdAt")
SELECT 'cmfreizeitaktivrest01', 'Freizeit Aktiv', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Section" WHERE "name" = 'Freizeit Aktiv'
);
