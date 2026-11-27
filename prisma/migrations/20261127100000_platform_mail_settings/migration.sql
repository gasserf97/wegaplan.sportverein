-- Zentraler Mail-Versand für alle Vereine ohne eigene SMTP-/API-Zugangsdaten.
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mailProvider" TEXT NOT NULL DEFAULT '',
    "mailFrom" TEXT NOT NULL DEFAULT '',
    "brevoApiKey" TEXT NOT NULL DEFAULT '',
    "resendApiKey" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" TEXT NOT NULL DEFAULT '',
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSettings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
