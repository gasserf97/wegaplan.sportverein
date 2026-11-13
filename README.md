# ASC Lajen – Kursanmeldungen

Plattform für den Amateursportclub Lajen/Raiffeisen: Mitglieder registrieren sich, Admins legen Kurse und Sektionen an, Teilnehmer buchen Tennisplätze und zahlen über Stripe oder Banküberweisung.

Farben wie auf [asclajen.com](https://www.asclajen.com): Rot `#e40000`, Grün `#228212`, Türkis `#007c94`.

## Funktionen

- Registrierung mit Benutzername, Geburtsdatum und Passwort
- Mitgliederverwaltung: alle Personen, Haupt-Admin und Sektions-Admins
- Sektionen anlegen und Mitgliedern zuweisen
- Kurse pro Sektion – nur Sektions-Admins (oder Haupt-Admin) legen Kurse an
- Tennisplatz-Reservierung mit Kalenderübersicht
- Kursbuchung und Zahlung über Stripe Checkout oder Banküberweisung

## Repository auf GitHub anlegen

Render braucht **GitHub** (nicht Origin). So legst du das Repo an:

Repository: [github.com/ASCLAJEN/sportverein.lajen](https://github.com/ASCLAJEN/sportverein.lajen)

```bash
git clone https://github.com/ASCLAJEN/sportverein.lajen.git
cd sportverein.lajen
```

## Auf Render veröffentlichen

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ASCLAJEN/sportverein.lajen)

1. Button klicken oder bei [Render](https://dashboard.render.com) → **New** → **Blueprint**.
2. GitHub-Account verbinden und Repo `ASCLAJEN/sportverein.lajen` wählen.
3. **Deploy Blueprint** – `render.yaml` legt Web-Service und Postgres in Frankfurt an.
4. Nach dem Deploy ist die App unter **https://app.asclajen.com** erreichbar.
5. **Einmalig** Demo-Daten laden (Render Shell oder lokal): `npm run db:seed`. Beim normalen Deploy wird der Seed **nicht** erneut ausgeführt – gelöschte Plätze/Fahrzeuge bleiben weg.

Für Zahlungen die sensiblen Stripe- und Bankdaten pro Sektion ausschließlich in
Render → Environment setzen (siehe unten). In der App-Datenbank wird nur ein
nicht-geheimer Env-Key pro Sektion gespeichert.

## Lokal starten

Voraussetzungen: Node.js 20.9 oder neuer und PostgreSQL.

```bash
cp .env.example .env
# AUTH_SECRET durch eine lange Zufallszeichenkette ersetzen

# Variante A: Docker
docker compose up -d

# Variante B: lokale PostgreSQL-Datenbank asclajen / User asclajen

npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Die App läuft unter [http://127.0.0.1:4521](http://127.0.0.1:4521).

### Demo-Zugänge nach dem Seed

| Rolle | Benutzername | Passwort |
| --- | --- | --- |
| Haupt-Admin | admin | Admin1234 |
| Teilnehmer | max | User1234 |
| Sektions-Admin Tennis | tennis | Tennis1234 |

## Zahlungsdaten

Für Kartenzahlungen und Überweisungen in Render → Environment pro Sektion eintragen (ohne Anführungszeichen, danach **Manual Deploy**). Den nicht-geheimen Key wie `TENNIS` unter Admin → Sektionen bei der jeweiligen Sektion speichern:

```
PAYMENT_TENNIS_STRIPE_SECRET_KEY=sk_test_xxxxxxxx   # Secret (sk_…) oder Restricted Key (rk_…)
PAYMENT_TENNIS_STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
PAYMENT_TENNIS_BANK_ACCOUNT_HOLDER=ASC Lajen Tennis
PAYMENT_TENNIS_BANK_IBAN=IT00X0000000000000000000000
NEXT_PUBLIC_APP_URL=https://app.asclajen.com
```

Platzhalter wie `sk_test_...` gelten nicht als Schlüssel. Erlaubt: `sk_test_` / `sk_live_` sowie Restricted Keys `rk_test_` / `rk_live_`.

Webhook-Endpunkt: `POST https://app.asclajen.com/api/stripe/webhook` (Events: `checkout.session.completed`, `invoice.paid`). Der Webhook wird erst nach der Zahlung gebraucht, nicht zum Öffnen der Stripe-Seite.

## Technik

Next.js, TypeScript, Tailwind, shadcn/ui, Prisma mit PostgreSQL, Stripe Checkout.
