# Starteraufgaben

Arbeitsblätter mit Starteraufgaben (Aufgaben links, freier Lösungsbereich rechts) erstellen – als installierbare WebApp für **PC und iPad**, auch ohne Internet.

Die App liegt hier: <https://lukasderewaelder.github.io/starteraufgaben/>

> **Stand: Meilenstein 1 (Blatt-Editor).** Du kannst ein Blatt bearbeiten (Antippen im Blatt), mit Auto-Anpassung der Schrift, Lösungsfeldern pro Aufgabe, Bildern, Rückgängig/Wiederholen und PDF-Export; alles wird automatisch auf dem Gerät gespeichert. Bibliothek mit Sicherung, Formel-Editor, Aufgabenbank und Generator folgen in den nächsten Meilensteinen.

## Bedienung

- **Im Blatt antippen:** Aufgabe (Zeile) antippen → rechts erscheint „Aufgabe“ mit Text, Formatierung, Bild, Lösungsfeld und Zeilenhöhe. Titel, Nummer, Zeit usw. antippen → das passende Feld im Reiter „Blatt“.
- **Text:** `$…$` für Formeln (z. B. `$\frac{3}{4}$`), `\$` für ein echtes Dollarzeichen, `**fett**`, `*kursiv*`, `__unterstrichen__`, Zeilen mit `a) ` als Teilaufgaben, `- ` als Aufzählung (die Knöpfe über dem Textfeld setzen das für dich).
- **Zu viel Inhalt:** Die Schrift wird automatisch bis auf 70 % verkleinert; passt es danach nicht, warnt ein gelber Hinweis und die betroffene Aufgabe ist markiert (im PDF ist die Markierung nicht enthalten).
- **PDF:** Knopf „PDF“ oben rechts → „Teilen …“ (am iPad z. B. „In GoodNotes öffnen“) oder „Herunterladen“.

## Datenschutz

- Die App lädt **nichts von fremden Servern** (keine CDNs, keine Google Fonts, keine Statistik). Alle Bibliotheken und Schriften liegen in diesem Repo.
- Dieses Repository ist öffentlich. Hier liegt nur der **Programmcode**. Deine Arbeitsblätter und Bilder bleiben später auf deinem Gerät (Browser-Speicher) bzw. in Sicherungsdateien, die du selbst ablegst (z. B. OneDrive).

## iPad-Test (Meilenstein 1)

Die installierte App holt sich die neue Version selbst: beim nächsten Start erscheint oben „Eine neue Version ist bereit“ → **Jetzt aktualisieren**.

1. Eine Aufgabe im Blatt antippen, Text tippen (auch mit dem Pencil/Scribble): wird der Text im Blatt sofort sichtbar? Bleibt die Bildschirmtastatur beim Antippen von **F K U a)** offen?
2. Eine Aufgabe mit `$\frac{3}{4}$` und eine mit Teilaufgaben `a)`/`b)` anlegen, 7 Aufgaben einstellen: passt alles aufs Blatt?
3. Ein Foto als **Bild** anhängen (Fotos/Dateien/Kamera).
4. **PDF** → **Teilen …** → „In GoodNotes öffnen“: Seite quer, Inhalt vollständig, Lösungsfeld-Muster sichtbar, **keine** gelbe Warnmarke?
5. Blatt schließen, App neu starten: sind Text und Bild noch da? Dann **Flugmodus** an und erneut starten.
6. Menü **⋯ → Diagnose → Diagnose kopieren** und den Text an Claude schicken.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer. Die App selbst braucht **keinen Build-Schritt** (reine ES-Module).

```bash
npm install                  # nur Entwicklungswerkzeuge (Playwright)
npm run serve                # lokaler Server auf http://localhost:4173/
npm test                     # Unit-Tests
npm run test:e2e             # Browser-Tests (nutzt installiertes Edge; PW_CHANNEL=chrome für Chrome)
node tools/precache.mjs      # sw.js (Dateiliste + Version) nach Änderungen an App-Dateien aktualisieren
node tools/icons.mjs         # PNG-Icons aus assets/icons/icon.svg neu erzeugen
```

Auf `localhost` ist der Service Worker aus, damit Änderungen sofort sichtbar sind; zum Testen des Offline-Betriebs `?sw=1` an die Adresse hängen.

## Bausteine und Lizenzen

Alle Fremdbibliotheken liegen unverändert in `vendor/` bzw. `assets/fonts/` (Lizenztexte daneben):

| Baustein | Version | Lizenz |
|---|---|---|
| [KaTeX](https://katex.org) (Formelsatz) | 0.19.1 | MIT |
| [MathLive](https://cortexjs.io/mathlive/) (Formel-Editor) | 0.111.1 | MIT |
| [jsPDF](https://github.com/parallax/jsPDF) (PDF) | 4.2.1 | MIT |
| [html2canvas](https://html2canvas.hertzen.com) (Blatt → Bild) | 1.4.1 | MIT |
| [Comic Neue](https://github.com/crozynski/comicneue) (Schrift, via Fontsource) | 5.3.0 | SIL OFL 1.1 |

`docs/original/Starteraufgaben.html` ist das ursprüngliche Ein-Datei-Werkzeug, aus dem diese App hervorgeht.
