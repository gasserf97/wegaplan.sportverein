import { ASC_CLUB } from "@/lib/brand";
import type { Locale } from "@/lib/i18n/types";

export type PrivacySection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type PrivacyContent = {
  title: string;
  updatedLabel: string;
  updatedAt: string;
  intro: string[];
  sections: PrivacySection[];
};

const CLUB_ADDRESS = `${ASC_CLUB.street}, ${ASC_CLUB.postalCode} ${ASC_CLUB.city}`;

const de: PrivacyContent = {
  title: "Datenschutz",
  updatedLabel: "Stand",
  updatedAt: "17. Oktober 2026",
  intro: [
    `Der ${ASC_CLUB.name} (Steuernummer ${ASC_CLUB.taxId}) betreibt diese Online-Plattform zur Verwaltung von Mitgliedschaften, Kursen, Tennisplatz- und Fahrzeugreservierungen sowie zugehörigen Zahlungen.`,
    "Mit dieser Information erläutern wir, welche personenbezogenen Daten wir verarbeiten, zu welchen Zwecken und welche Rechte Ihnen nach der DSGVO (Verordnung (EU) 2016/679) und dem italienischen Datenschutzrecht zustehen.",
  ],
  sections: [
    {
      heading: "1. Verantwortlicher",
      paragraphs: [
        `${ASC_CLUB.name}`,
        CLUB_ADDRESS,
        `Steuernummer: ${ASC_CLUB.taxId}`,
        `Vertreten durch den Präsidenten: ${ASC_CLUB.president}`,
        "Anfragen zum Datenschutz können Sie über das Support-Ticket in der App oder schriftlich an die Vereinsadresse richten.",
      ],
    },
    {
      heading: "2. Welche Daten wir verarbeiten",
      paragraphs: [
        "Je nach Nutzung der Plattform können insbesondere folgende Daten verarbeitet werden:",
      ],
      bullets: [
        "Stammdaten: Name, E-Mail-Adresse, Geburtsdatum, Telefonnummer, Anschrift, Steuernummer (Codice Fiscale)",
        "Kontodaten: Benutzername, Passwort (verschlüsselt gespeichert), Anmelde- und Sitzungsinformationen",
        "Familienkonto: Angaben zu Familienmitgliedern, die Sie verwalten (z. B. Kinder ohne eigenen Login)",
        "Mitgliedschaften und Kurse: Buchungen, Wartelistenplätze, Zahlungsstatus, ggf. ärztliche Atteste (Hochladen nur wenn für einen Kurs erforderlich)",
        "Reservierungen: Tennisplätze und Vereinsfahrzeuge inkl. Zeitraum und Zahlungsdaten",
        "Kalender-Abo (optional): ein persönlicher Link, über den bestätigte Tennisplatz-Buchungen und gebuchte Kurse in Google Kalender oder den iPhone-Kalender übernommen werden – nur wenn Sie die Synchronisation unter „Mein Konto“ einschalten",
        "Zahlungsabwicklung: Beträge, Zahlungsmethode, Transaktionskennungen; Kartendaten werden von Stripe verarbeitet und nicht bei uns gespeichert",
        "Support: Betreff und Inhalt von Tickets sowie zugehörige Kontaktdaten",
        "Technische Daten: IP-Adresse, Browser-/Geräteinformationen und Protokolldaten, soweit für Betrieb, Sicherheit und Fehlerbehebung erforderlich",
      ],
    },
    {
      heading: "3. Zwecke und Rechtsgrundlagen",
      paragraphs: [
        "Wir verarbeiten personenbezogene Daten zu folgenden Zwecken:",
      ],
      bullets: [
        "Bereitstellung und Verwaltung Ihres Nutzerkontos sowie der Familienverwaltung (Art. 6 Abs. 1 lit. b DSGVO – Vertrag/vorvertragliche Maßnahmen)",
        "Abschluss und Verwaltung von Vereins- und Zusatzmitgliedschaften sowie Kursanmeldungen (Art. 6 Abs. 1 lit. b DSGVO)",
        "Reservierung von Tennisplätzen und Fahrzeugen (Art. 6 Abs. 1 lit. b DSGVO)",
        "Anzeige bestätigter Tennis- und Kurstermine in Ihrem Google- oder iPhone-Kalender nur nach Aktivierung unter „Mein Konto“ (Art. 6 Abs. 1 lit. a DSGVO – Einwilligung). Ausschalten beendet die Weitergabe",
        "Zahlungsabwicklung und Buchhaltung inkl. gesetzlicher Aufbewahrungspflichten (Art. 6 Abs. 1 lit. b und lit. c DSGVO)",
        "Kommunikation zu Buchungen, Bestätigungen, Wartelisten und Support (Art. 6 Abs. 1 lit. b und lit. f DSGVO)",
        "Sicherheit, Missbrauchsprävention und technischer Betrieb der Plattform (Art. 6 Abs. 1 lit. f DSGVO)",
        "Verarbeitung besonderer Kategorien von Daten (z. B. ärztliche Atteste) nur, soweit für die Kursteilnahme erforderlich und auf Grundlage von Art. 9 Abs. 2 lit. a und/oder lit. g DSGVO in Verbindung mit Ihrer Einwilligung bzw. den Vereinsregeln",
      ],
    },
    {
      heading: "4. Empfänger und Auftragsverarbeiter",
      paragraphs: [
        "Daten werden nur weitergegeben, soweit das für die genannten Zwecke erforderlich ist:",
      ],
      bullets: [
        "Vorstand, Verwaltungsmitglieder und Sektions-Admins des Vereins – im Rahmen ihrer Aufgaben",
        "Stripe – Online-Zahlungen (Kartenzahlungen und Abos). Stripe handelt als eigenständiger bzw. beauftragter Zahlungsdienstleister; es gelten zusätzlich die Datenschutzbestimmungen von Stripe",
        "Hosting-, E-Mail- und Infrastrukturdienstleister – zur Bereitstellung der Plattform und zum Versand von Systemmails (z. B. Bestätigungen, Mitgliedskarten)",
        "Google bzw. Apple – nur die Termine Ihres Kalender-Abos, und nur solange Sie es selbst abonniert und die Synchronisation eingeschaltet haben. Wer den persönlichen Link kennt, kann dieselben Termine abrufen",
        "Behörden – nur wenn eine gesetzliche Pflicht besteht",
      ],
    },
    {
      heading: "5. Speicherdauer",
      paragraphs: [
        "Wir speichern personenbezogene Daten nur so lange, wie es für die Zwecke der Verarbeitung erforderlich ist oder gesetzliche Aufbewahrungsfristen (insbesondere steuer- und handelsrechtliche Fristen in Italien) gelten.",
        "Kontodaten bleiben bestehen, solange Ihr Konto aktiv ist. Nach Löschung bzw. Beendigung der Mitgliedschaft werden Daten gelöscht oder eingeschränkt, soweit keine Aufbewahrungspflichten entgegenstehen.",
        "Zahlungs- und Buchhaltungsunterlagen werden in der Regel für die gesetzlich vorgeschriebene Dauer aufbewahrt.",
        "Hochgeladene Atteste werden mit der jeweiligen Kursanmeldung verknüpft und nach Ablauf der erforderlichen Frist gelöscht oder anonymisiert.",
      ],
    },
    {
      heading: "6. Cookies und Sitzungen",
      paragraphs: [
        "Für den Login verwenden wir technisch notwendige Sitzungs-Cookies bzw. vergleichbare Speichermechanismen. Sie sind erforderlich, um Sie angemeldet zu halten und die Sicherheit der Sitzung zu gewährleisten.",
        "Es werden keine Tracking- oder Werbe-Cookies zu Analyse- oder Marketingzwecken eingesetzt.",
        "Die Sprachauswahl (DE/IT) kann lokal in Ihrem Browser gespeichert werden.",
      ],
    },
    {
      heading: "7. Ihre Rechte",
      paragraphs: [
        "Sie haben nach der DSGVO insbesondere folgende Rechte:",
      ],
      bullets: [
        "Auskunft über die verarbeiteten Daten (Art. 15)",
        "Berichtigung unrichtiger Daten (Art. 16)",
        "Löschung („Recht auf Vergessenwerden“), soweit zulässig (Art. 17)",
        "Einschränkung der Verarbeitung (Art. 18)",
        "Datenübertragbarkeit (Art. 20)",
        "Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21)",
        "Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft",
        "Beschwerde bei der italienischen Datenschutzbehörde Garante per la protezione dei dati personali (www.garanteprivacy.it)",
      ],
    },
    {
      heading: "8. Pflicht zur Angabe von Daten",
      paragraphs: [
        "Für Registrierung, Mitgliedschaft und Buchungen sind bestimmte Angaben erforderlich (z. B. Name, E-Mail, Geburtsdatum, Steuernummer, Anschrift). Ohne diese Daten können wir die entsprechenden Leistungen nicht erbringen.",
        "Optionale Angaben (z. B. Telefon) erleichtern die Erreichbarkeit, sind aber nicht immer zwingend.",
      ],
    },
    {
      heading: "9. Sicherheit",
      paragraphs: [
        "Wir treffen angemessene technische und organisatorische Maßnahmen, um Ihre Daten vor Verlust, Missbrauch und unbefugtem Zugriff zu schützen (u. a. verschlüsselte Übertragung, Zugangskontrollen, rollenbasierte Berechtigungen für Admins).",
      ],
    },
    {
      heading: "10. Änderungen",
      paragraphs: [
        "Wir können diese Datenschutzerklärung anpassen, wenn sich die Plattform, die Rechtslage oder unsere Verfahren ändern. Die jeweils aktuelle Fassung finden Sie auf dieser Seite mit dem angegebenen Stand.",
      ],
    },
  ],
};

const it: PrivacyContent = {
  title: "Privacy",
  updatedLabel: "Aggiornato al",
  updatedAt: "17 ottobre 2026",
  intro: [
    `L’${ASC_CLUB.name} (codice fiscale ${ASC_CLUB.taxId}) gestisce questa piattaforma online per tesseramenti, corsi, prenotazioni dei campi da tennis e dei veicoli del club nonché i relativi pagamenti.`,
    "Con la presente informativa spieghiamo quali dati personali trattiamo, per quali finalità e quali diritti Le spettano ai sensi del GDPR (Regolamento UE 2016/679) e della normativa italiana sulla protezione dei dati.",
  ],
  sections: [
    {
      heading: "1. Titolare del trattamento",
      paragraphs: [
        `${ASC_CLUB.name}`,
        CLUB_ADDRESS,
        `Codice fiscale: ${ASC_CLUB.taxId}`,
        `Rappresentato dal Presidente: ${ASC_CLUB.president}`,
        "Per richieste in materia di privacy può utilizzare il ticket di supporto nell’app oppure scrivere all’indirizzo del club.",
      ],
    },
    {
      heading: "2. Dati trattati",
      paragraphs: [
        "A seconda dell’uso della piattaforma possono essere trattati in particolare i seguenti dati:",
      ],
      bullets: [
        "Dati anagrafici: nome, e-mail, data di nascita, telefono, indirizzo, codice fiscale",
        "Dati dell’account: nome utente, password (archiviata in forma cifrata), informazioni di accesso e di sessione",
        "Account familiare: dati dei familiari gestiti da Lei (ad es. minori senza login proprio)",
        "Tesseramenti e corsi: iscrizioni, liste d’attesa, stato dei pagamenti, eventuali certificati medici (caricati solo se richiesti per un corso)",
        "Prenotazioni: campi da tennis e veicoli del club con orari e dati di pagamento",
        "Calendario (facoltativo): un link personale con cui le prenotazioni confermate dei campi da tennis e i corsi prenotati compaiono in Google Calendar o nel calendario iPhone – solo se attivate la sincronizzazione in «Il mio account»",
        "Pagamenti: importi, metodo di pagamento, identificativi di transazione; i dati della carta sono trattati da Stripe e non vengono memorizzati da noi",
        "Supporto: oggetto e contenuto dei ticket nonché dati di contatto correlati",
        "Dati tecnici: indirizzo IP, informazioni su browser/dispositivo e log necessari per esercizio, sicurezza e risoluzione di errori",
      ],
    },
    {
      heading: "3. Finalità e basi giuridiche",
      paragraphs: [
        "Trattiamo i dati personali per le seguenti finalità:",
      ],
      bullets: [
        "Creazione e gestione dell’account utente e della famiglia (art. 6 par. 1 lett. b GDPR – contratto/misure precontrattuali)",
        "Stipula e gestione di tesseramenti club e abbonamenti aggiuntivi nonché iscrizioni ai corsi (art. 6 par. 1 lett. b GDPR)",
        "Prenotazione di campi da tennis e veicoli (art. 6 par. 1 lett. b GDPR)",
        "Visualizzazione delle prenotazioni tennis e dei corsi confermati nel calendario Google o iPhone solo dopo l’attivazione in «Il mio account» (art. 6 par. 1 lett. a GDPR – consenso). Disattivando si interrompe la comunicazione",
        "Pagamenti e contabilità, inclusa la conservazione obbligatoria per legge (art. 6 par. 1 lett. b e c GDPR)",
        "Comunicazioni su prenotazioni, conferme, liste d’attesa e supporto (art. 6 par. 1 lett. b e f GDPR)",
        "Sicurezza, prevenzione di abusi e funzionamento tecnico della piattaforma (art. 6 par. 1 lett. f GDPR)",
        "Trattamento di categorie particolari di dati (ad es. certificati medici) solo se necessario per la partecipazione al corso e sulla base dell’art. 9 par. 2 lett. a e/o g GDPR in combinato disposto con il Suo consenso ovvero le regole del club",
      ],
    },
    {
      heading: "4. Destinatari e responsabili del trattamento",
      paragraphs: [
        "I dati sono comunicati solo se necessario per le finalità sopra indicate:",
      ],
      bullets: [
        "Consiglio direttivo, collaboratori amministrativi e admin di sezione del club – nei limiti dei rispettivi compiti",
        "Stripe – pagamenti online (carte e abbonamenti). Stripe agisce come prestatore di servizi di pagamento; si applicano anche le informative privacy di Stripe",
        "Fornitori di hosting, e-mail e infrastruttura – per erogare la piattaforma e inviare e-mail di sistema (conferme, tessere digitali, ecc.)",
        "Google o Apple – solo gli appuntamenti del calendario in abbonamento, e solo finché l’avete sottoscritto voi e la sincronizzazione è attiva. Chi conosce il link personale può leggere gli stessi appuntamenti",
        "Autorità pubbliche – solo in presenza di un obbligo di legge",
      ],
    },
    {
      heading: "5. Periodo di conservazione",
      paragraphs: [
        "Conserviamo i dati personali solo per il tempo necessario alle finalità del trattamento o per gli obblighi di legge di conservazione (in particolare obblighi fiscali e contabili in Italia).",
        "I dati dell’account restano finché l’account è attivo. Dopo la cancellazione o la cessazione del tesseramento i dati sono cancellati o limitati, salvo obblighi di conservazione.",
        "Documenti di pagamento e contabilità sono di regola conservati per il periodo previsto dalla legge.",
        "I certificati medici caricati sono collegati alla relativa iscrizione al corso e cancellati o anonimizzati allo scadere del termine necessario.",
      ],
    },
    {
      heading: "6. Cookie e sessioni",
      paragraphs: [
        "Per l’accesso utilizziamo cookie di sessione tecnicamente necessari o meccanismi equivalenti. Servono a mantenerLa autenticata e a garantire la sicurezza della sessione.",
        "Non utilizziamo cookie di tracciamento o pubblicitari a fini di analisi o marketing.",
        "La scelta della lingua (DE/IT) può essere memorizzata localmente nel Suo browser.",
      ],
    },
    {
      heading: "7. I Suoi diritti",
      paragraphs: [
        "Ai sensi del GDPR Le spettano in particolare i seguenti diritti:",
      ],
      bullets: [
        "Accesso ai dati trattati (art. 15)",
        "Rettifica dei dati inesatti (art. 16)",
        "Cancellazione, nei limiti consentiti (art. 17)",
        "Limitazione del trattamento (art. 18)",
        "Portabilità dei dati (art. 20)",
        "Opposizione ai trattamenti basati su interessi legittimi (art. 21)",
        "Revoca di un consenso prestato, con effetto per il futuro",
        "Reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it)",
      ],
    },
    {
      heading: "8. Natura obbligatoria dei dati",
      paragraphs: [
        "Per registrazione, tesseramento e prenotazioni sono necessari determinati dati (ad es. nome, e-mail, data di nascita, codice fiscale, indirizzo). Senza tali dati non possiamo erogare i relativi servizi.",
        "Dati facoltativi (ad es. telefono) facilitano i contatti, ma non sono sempre obbligatori.",
      ],
    },
    {
      heading: "9. Sicurezza",
      paragraphs: [
        "Adottiamo misure tecniche e organizzative adeguate per proteggere i Suoi dati da perdita, uso improprio e accessi non autorizzati (tra cui trasmissione cifrata, controlli di accesso, autorizzazioni basate su ruoli per gli admin).",
      ],
    },
    {
      heading: "10. Modifiche",
      paragraphs: [
        "Possiamo aggiornare questa informativa se cambiano la piattaforma, la normativa o le nostre procedure. La versione aggiornata è sempre disponibile su questa pagina con la data di aggiornamento indicata.",
      ],
    },
  ],
};

export function getPrivacyContent(locale: Locale): PrivacyContent {
  return locale === "it" ? it : de;
}
