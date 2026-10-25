# Starteraufgaben

Arbeitsblätter mit Starteraufgaben (Aufgaben links, freier Lösungsbereich rechts) erstellen – als installierbare WebApp für **PC und iPad**, auch ohne Internet.

Die App liegt hier: <https://lukasderewaelder.github.io/starteraufgaben/>

> **Stand: Meilenstein 0 (Technik-Test).** Die Seite zeigt ein festes Beispielblatt und prüft, ob PDF-Export, Formel-Editor und Offline-Betrieb auf deinem Gerät funktionieren. Die eigentliche Bedienung (Bibliothek, Aufgabenbank, Generator) folgt in den nächsten Meilensteinen.

## Datenschutz

- Die App lädt **nichts von fremden Servern** (keine CDNs, keine Google Fonts, keine Statistik). Alle Bibliotheken und Schriften liegen in diesem Repo.
- Dieses Repository ist öffentlich. Hier liegt nur der **Programmcode**. Deine Arbeitsblätter und Bilder bleiben später auf deinem Gerät (Browser-Speicher) bzw. in Sicherungsdateien, die du selbst ablegst (z. B. OneDrive).

## iPad-Test (Meilenstein 0)

1. In **Safari** die Adresse oben öffnen. Unten in der Karte „3 · Offline und Installation“ auf **Aktualisieren** tippen.
2. **Teilen-Symbol → „Zum Home-Bildschirm“** und die App von dort starten. In der Diagnose sollte „Als App installiert: ja“ stehen.
3. **PDF erstellen** → **Teilen …** → z. B. „In GoodNotes öffnen“ oder „In Dateien sichern“. Prüfen: Seite quer, Inhalt vollständig, Muster (kariert/liniert/Punkte) sichtbar.
4. **Formel-Editor starten**: mit der Bildschirmtastatur eine Formel eingeben (z. B. Bruch), dann **In Aufgabe 1 einfügen**.
5. **Flugmodus** einschalten, App neu starten: Blatt erscheint, PDF lässt sich weiter erstellen.
6. Unten **Diagnose kopieren** und den Text an Claude schicken.

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
