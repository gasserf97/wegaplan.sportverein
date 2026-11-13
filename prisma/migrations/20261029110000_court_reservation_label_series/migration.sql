-- Kommentar/Bezeichnung und Serienbuchungen für Tennisplatz-Reservierungen.
ALTER TABLE "CourtReservation" ADD COLUMN "label" TEXT;
ALTER TABLE "CourtReservation" ADD COLUMN "seriesId" TEXT;

CREATE INDEX "CourtReservation_seriesId_idx" ON "CourtReservation"("seriesId");
