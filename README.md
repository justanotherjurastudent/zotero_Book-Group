# Book Group

> Zotero-10-Plugin, das Buchteile und Enzyklopädieartikel sichtbar unter ihrem Sammelwerk gruppiert – auf Basis der vorhandenen „Verwandt“-Verknüpfungen, ohne Ihre Daten zu verändern.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Zotero 10](https://img.shields.io/badge/Zotero-10-CC2936.svg)](https://www.zotero.org/)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

## Warum?

In Zotero stehen Buchteile alphabetisch verstreut in der Bibliothek, getrennt vom Sammelwerk, aus dem sie stammen. Wer mit Handbüchern, Kommentaren oder Festschriften arbeitet, verliert so schnell den Überblick. Book Group zeigt jedes Sammelwerk mit seinen Beiträgen als zusammenhängende Gruppe an.

## Features

- **Gruppierte Sortierung:** Beiträge (`bookSection`, `encyclopediaArticle`) stehen direkt unter ihrem Sammelwerk (`book`), geordnet nach erster Seite.
- **Eindeutige Zuordnung:** Ist ein Beitrag mit mehreren Büchern verknüpft, gewinnt das Buch mit gleichem Buchtitel und mindestens einem gemeinsamen Herausgeber.
- **Einrückung, Hintergrund und Konturlinie**, mit zehn vordefinierten Farben oder einer zufälligen, dauerhaft gespeicherten Farbe je Sammelwerk.
- **Relations als einzige Datenquelle:** Die Zuordnung kommt ausschließlich aus Zoteros „Verwandt“. Das Plugin schreibt nichts in Ihre Bibliothek; Sync und Export bleiben unberührt.
- **Ein- und Ausschalten per Klick:** über **Ansicht → Sortieren nach → Nach Sammelwerk gruppieren**, per Rechtsklick auf eine Spaltenüberschrift (auch im Word-/LibreOffice-Dialog) oder über die Spalte „Sammelwerk“.
- **Zitationsdialoge:** Gruppierung auch in „Zitation hinzufügen/bearbeiten“ (Bibliotheks- und Listenansicht) und „Literaturverzeichnis bearbeiten“ (Word/LibreOffice).
- **Sofort wirksame Einstellungen:** Einrückung, Farben, Sortierung der Gruppen (Autor/Jahr/Titel oder Titel/Autor/Jahr).
- **Bleibt erhalten:** Eine aktive Gruppierung der Hauptliste wird nach einem Plugin-Update oder erneutem Aktivieren wiederhergestellt.
- Oberfläche auf Deutsch und Englisch.

## Schnellstart

1. `book-group.xpi` aus den [Releases](https://github.com/justanotherjurastudent/zotero_SortPartsToBooks/releases) herunterladen.
2. In Zotero 10: **Werkzeuge → Plugins → Zahnrad → Plugin aus Datei installieren…**
3. Buch und Buchteil über **Verwandt** verknüpfen (oder beim Buch **Buchteil erstellen** verwenden).
4. **Ansicht → Sortieren nach → Nach Sammelwerk gruppieren** wählen.

Ausführliche Anleitung: [Benutzerhandbuch](docs/user-guide.md)

## Installation

**Voraussetzung:** Zotero 10.x

- **Release:** `book-group.xpi` herunterladen und wie oben installieren.
- **Selbst bauen:** Node.js mit npm vorausgesetzt.

  ```bash
  npm install
  npm run build
  ```

  Die fertige Datei liegt unter `.scaffold/build/book-group.xpi`.

## Entwicklung

| Befehl               | Zweck                                                                      |
| -------------------- | -------------------------------------------------------------------------- |
| `npm run build`      | Plugin bauen (`.scaffold/build/`) und TypeScript prüfen                    |
| `npm start`          | Zotero mit dem Plugin im Entwicklungsmodus starten (`zotero-plugin serve`) |
| `npm run test:unit`  | Unit-Tests der reinen Logik in Node (`test/unit/`)                         |
| `npm test`           | Integrationstests in einer echten Zotero-Instanz (`test/zotero/`)          |
| `npm run lint:check` | Prettier und ESLint prüfen                                                 |

`npm run test:unit` nutzt `node --test` direkt auf `.ts`-Dateien und braucht daher eine Node-Version, die TypeScript nativ ausführt (z. B. Node 24).

### Integrationstests (`npm test`)

Kopieren Sie `.env.example` nach `.env` (oder setzen Sie Umgebungsvariablen) und tragen Sie den Pfad zur Zotero-10-Programmdatei ein:

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = C:\\Program Files\\Zotero\\zotero.exe
```

Unter Windows werden Backslashes in `.env` verdoppelt (siehe Kommentar in `.env.example`).

> **Achtung unter Windows:** Setzen Sie unbedingt auch
>
> ```ini
> ZOTERO_PLUGIN_KILL_COMMAND = cmd /c exit 0
> ```
>
> Ohne diese Variable beendet der Test-Runner von `zotero-plugin-scaffold` Zotero am Ende per `taskkill /f /im zotero.exe`. Das trifft **alle** laufenden Zotero-Instanzen, auch Ihre normale Arbeitsinstanz.

Der Test-Runner startet Zotero mit einem eigenen, jeweils geleerten Profil und Datenverzeichnis unter `.scaffold/test/`. Ihre normale Bibliothek wird nicht verwendet.

### Projektstruktur

```text
addon/            Manifest, bootstrap.js, prefs.js, Preference-Pane, CSS, Lokalisierung
src/hooks.ts      Lifecycle: startup, Fenster laden/entladen, shutdown, Pref-Änderungen
src/modules/      Zotero-Integration (Cache, Sortierung, Patches, Dialoge, Menü, Farben)
src/modules/core/ Reine Logik ohne Zotero-API (in Node testbar)
test/unit/        Node-Tests
test/zotero/      Integrationstests in Zotero
docs/             Dokumentation
```

## Dokumentation

- [Benutzerhandbuch](docs/user-guide.md): Installation, Bedienung, Einstellungen, Grenzen, Fehlerbehebung
- [Architektur](docs/architecture.md): Komponenten, Datenfluss, Lifecycle, Designentscheidungen, verwendete Zotero-Interna
- [API-Referenz](docs/api.md): Klassen und Funktionen, `Zotero.BookGroup.api.getServices()`, CSS-Klassen, Preferences

## Hinweis zur Kompatibilität

Die Gruppierung greift auf interne, undokumentierte Teile der Zotero-Eintragsliste zu, die gegen Zotero 10.0.2 geprüft sind. Spätere Zotero-Versionen können diese ändern. Details und betroffene Stellen: [Architektur – Verwendete Zotero-Interna](docs/architecture.md#verwendete-zotero-interna-und-update-risiko).

## Lizenz

[AGPL-3.0-or-later](LICENSE)

Basiert auf [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).
