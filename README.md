# Book Group

**Languages / Sprachen:** [Deutsch](#deutsch) | [English](#english)

> Zotero-10-Plugin, das Buchteile und Enzyklopädieartikel sichtbar unter ihrem Sammelwerk gruppiert – auf Basis der vorhandenen „Verwandt“-Verknüpfungen, ohne Ihre Daten zu verändern.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Zotero 10](https://img.shields.io/badge/Zotero-10-CC2936.svg)](https://www.zotero.org/)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

## <a id="deutsch"></a>🇩🇪 Deutsch

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

Beispiel:
<img width="1004" height="395" alt="image" src="https://github.com/user-attachments/assets/1ac1578d-6a67-4562-8cfb-fba48a398a18" />

## Schnellstart

1. `book-group.xpi` aus den [Releases](https://github.com/justanotherjurastudent/zotero_Book-Group/releases) herunterladen.
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

---

## <a id="english"></a>🇬🇧 English

> Zotero 10 plugin that groups book sections and encyclopedia articles visibly under their parent work – based on existing "Related" links, without modifying your data.

## Why?

In Zotero, book sections are scattered alphabetically in your library, separated from the collection they come from. If you work with handbooks, commentaries, or festschrifts, you quickly lose track. Book Group shows each collection with its contributions as a cohesive group.

## Features

- **Grouped Sorting:** Entries (`bookSection`, `encyclopediaArticle`) appear directly under their collection (`book`), ordered by first page.
- **Unambiguous Assignment:** If an entry is linked to multiple books, the one with the same title and at least one shared editor wins.
- **Indentation, Background Color, and Outline** with ten predefined colors or a random, permanently stored color per collection.
- **Relations as Sole Data Source:** Assignment comes exclusively from Zotero's "Related" field. The plugin writes nothing to your library; sync and export are unaffected.
- **Toggle with One Click:** via **View → Sort by → Group by Collection**, right-click on any column header (also in Word/LibreOffice dialogs), or via the "Collection" column.
- **Citation Dialogs:** Grouping also works in "Add/Edit Citation" (library and list views) and "Edit Bibliography" (Word/LibreOffice).
- **Settings Take Effect Immediately:** Indentation, colors, and group sort order (author/year/title or title/author/year).
- **Persisted:** An active grouping of the main list is restored after a plugin update or re-enabling.
- User interface in German and English.

Example:
<img width="1004" height="395" alt="image" src="https://github.com/user-attachments/assets/1ac1578d-6a67-4562-8cfb-fba48a398a18" />

## Quick Start

1. Download `book-group.xpi` from [Releases](https://github.com/justanotherjurastudent/zotero_Book-Group/releases).
2. In Zotero 10: **Tools → Add-ons → Gear Icon → Install Add-on from File…**
3. Link book and book section via **Related** (or use **Create Book Section** on the book).
4. Select **View → Sort by → Group by Collection**.

Detailed Guide: [User Guide](docs/user-guide.md)

## Installation

**Requirement:** Zotero 10.x

- **Release:** Download `book-group.xpi` and install as shown above.
- **Build Yourself:** Node.js with npm required.

    ```bash
    npm install
    npm run build
    ```

    The finished file is located in `.scaffold/build/book-group.xpi`.

## Development

| Command              | Purpose                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `npm run build`      | Build plugin (`.scaffold/build/`) and check TypeScript                   |
| `npm start`          | Start Zotero with the plugin in development mode (`zotero-plugin serve`) |
| `npm run test:unit`  | Run unit tests of pure logic in Node (`test/unit/`)                      |
| `npm test`           | Run integration tests in a real Zotero instance (`test/zotero/`)         |
| `npm run lint:check` | Check Prettier and ESLint                                                |

`npm run test:unit` uses `node --test` directly on `.ts` files and therefore requires a Node version that runs TypeScript natively (e.g., Node 24).

### Integration Tests (`npm test`)

Copy `.env.example` to `.env` (or set environment variables) and enter the path to your Zotero 10 binary:

```ini
ZOTERO_PLUGIN_ZOTERO_BIN_PATH = C:\\Program Files\\Zotero\\zotero.exe
```

On Windows, backslashes in `.env` are doubled (see comment in `.env.example`).

> **Important on Windows:** Also set
>
> ```ini
> ZOTERO_PLUGIN_KILL_COMMAND = cmd /c exit 0
> ```
>
> Without this variable, the test runner from `zotero-plugin-scaffold` terminates Zotero via `taskkill /f /im zotero.exe`. This affects **all** running Zotero instances, including your normal work instance.

The test runner starts Zotero with its own, separately cleared profile and data directory in `.scaffold/test/`. Your normal library is not used.

### Project Structure

```text
addon/            Manifest, bootstrap.js, prefs.js, Preference Pane, CSS, Localization
src/hooks.ts      Lifecycle: startup, window load/unload, shutdown, preference changes
src/modules/      Zotero Integration (cache, sorting, patches, dialogs, menu, colors)
src/modules/core/ Pure logic without Zotero API (testable in Node)
test/unit/        Node tests
test/zotero/      Integration tests in Zotero
docs/             Documentation
```

## Documentation

- [User Guide](docs/user-guide.md): Installation, usage, settings, limitations, troubleshooting
- [Architecture](docs/architecture.md): Components, data flow, lifecycle, design decisions, Zotero internals used
- [API Reference](docs/api.md): Classes and functions, `Zotero.BookGroup.api.getServices()`, CSS classes, Preferences

## Compatibility Notice

The grouping accesses internal, undocumented parts of Zotero's item list that have been checked against Zotero 10.0.2. Later Zotero versions may change these. Details and affected locations: [Architecture – Zotero Internals Used](docs/architecture.md#verwendete-zotero-interna-und-update-risiko).

## License

[AGPL-3.0-or-later](LICENSE)

Based on [windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).
