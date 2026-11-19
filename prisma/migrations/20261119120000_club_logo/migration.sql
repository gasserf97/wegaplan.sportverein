-- Logo pro Verein (ClubSettings), nicht eine globale Datei.
ALTER TABLE "ClubSettings" ADD COLUMN "logoStorageKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClubSettings" ADD COLUMN "logoMimeType" TEXT NOT NULL DEFAULT '';
