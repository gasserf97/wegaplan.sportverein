/** ASC Lajen Raiffeisen – Farben von asclajen.com */
export const ASC_LAJEN = {
  red: "#e40000",
  redBright: "#ff1919",
  green: "#228212",
  greenLight: "#4AAE48",
  teal: "#007c94",
  navy: "#1B365D",
  dark: "#151515",
  light: "#f8f8f8",
  white: "#ffffff",
} as const;

/** Vereinsangaben für offizielle Schreiben (Einzahlungsbestätigung / Ricevuta). */
export const ASC_CLUB = {
  name: "ASC Lajen Raiffeisen",
  namePrimary: "ASC LAJEN",
  nameSecondary: "RAIFFEISEN",
  president: "Michael Prader",
  street: "Kesselweg 8/B",
  postalCode: "39040",
  city: "Lajen",
  /** Provinzkürzel für italienische Belege, z. B. (BZ) */
  province: "BZ",
  taxId: "80014090213",
  /** Partita IVA (bei ASD oft gleich der Codice fiscale) */
  vatId: "80014090213",
  legalForm: "ASSOCIAZIONE SPORTIVA DILETTANTISTICA",
  /** Bezeichnung der Tennis-Sektion auf der Platz-Ricevuta */
  tennisClubName: "TENNIS CLUB ASC LAJEN",
} as const;

/** Statische Logo-Pfade unter /public. */
export const ASC_LOGOS = {
  /** Figuren-Icon (quadratisch) – Header, Favicon, E-Mail. */
  icon: "/asc-logo-icon.png",
  /** Hochformat mit Figuren + Schrift. */
  mark: "/asc-logo-mark.png",
  /** Querformat nur Schrift ASC LAJEN / RAIFFEISEN. */
  wordmark: "/asc-logo-wordmark.png",
  /** Vereinsstempel mit Unterschrift (Einzahlungsbestätigung). */
  stamp: "/asc-stamp-signature.jpg",
} as const;

