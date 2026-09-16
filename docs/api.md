# API-Referenz

Diese Referenz beschreibt die Klassen, Funktionen, CSS-Klassen und Preferences von **Book Group**. Wie die Teile zusammenspielen, erklärt [architecture.md](architecture.md).

> **Stabilität:** Der einzige vorgesehene Einstiegspunkt von außen ist `Zotero.BookGroup.api.getServices()`. Die dahinterliegenden Klassen sind Modul-Schnittstellen des Plugins und können sich zwischen Versionen ändern.

Alle Beispiele lassen sich in Zotero unter **Werkzeuge → Entwickler → JavaScript ausführen** (_Tools → Developer → Run JavaScript_) testen. Dort ist `await` auf oberster Ebene erlaubt, wenn „Als asynchrone Funktion ausführen“ aktiviert ist.

## Inhalt

- [Plugin-Instanz `Zotero.BookGroup`](#plugin-instanz-zoterobookgroup)
- [`BookGroupServices`](#bookgroupservices)
- [`SettingsStore`](#settingsstore)
- [`RelationCache`](#relationcache)
- [`RelationIndex` und `resolveLinks`](#relationindex-und-resolvelinks)
- [`GroupSorter`](#groupsorter)
- [Ordnungsfunktionen (`core/groupOrder.ts`)](#ordnungsfunktionen-coregrouporderts)
- [`GroupColors`](#groupcolors)
- [`TreeIntegration`](#treeintegration)
- [`DialogIntegration`](#dialogintegration)
- [`ViewMenu`](#viewmenu)
- [Sortierspalte (`column.ts`)](#sortierspalte-columnts)
- [Styles (`styles.ts`)](#styles-stylests)
- [Preference-Pane (`preferencePane.ts`)](#preference-pane-preferencepanets)
- [Item-Typen (`itemTypes.ts`)](#item-typen-itemtypests)
- [Konstanten (`constants.ts`)](#konstanten-constantsts)
- [CSS-Klassen und CSS-Variablen](#css-klassen-und-css-variablen)
- [Preferences](#preferences)
- [Lifecycle-Hooks](#lifecycle-hooks)

---

## Plugin-Instanz `Zotero.BookGroup`

Beim Laden legt `src/index.ts` die Instanz der Klasse `Addon` (`src/addon.ts`) unter `Zotero.BookGroup` ab (`addonInstance` aus `package.json`).

| Eigenschaft         | Typ                                    | Beschreibung                                                       |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `api.getServices()` | `() => BookGroupServices \| undefined` | Laufende Dienste; `undefined` vor dem Start und nach dem Shutdown  |
| `data.initialized`  | `boolean`                              | `true`, sobald `onStartup()` vollständig durchgelaufen ist         |
| `data.alive`        | `boolean`                              | `false` nach dem Shutdown                                          |
| `data.config`       | `object`                               | `addonName`, `addonID`, `addonRef`, `addonInstance`, `prefsPrefix` |
| `data.env`          | `"development" \| "production"`        | Build-Umgebung                                                     |
| `hooks`             | `object`                               | Lifecycle-Hooks, siehe [Lifecycle-Hooks](#lifecycle-hooks)         |

### Beispiel: Dienste abrufen

```js
const bg = Zotero.BookGroup.api.getServices();
if (!bg) {
	throw new Error("Book Group ist nicht gestartet");
}
return {
	links: bg.relations.index.linkCount,
	columnKey: bg.trees.columnKey,
	settings: bg.settings.current,
	pendingRestore: bg.pendingRestore,
};
```

---

## `BookGroupServices`

`src/addon.ts`. Wird in `hooks.onStartup()` erzeugt.

```ts
interface BookGroupServices {
	settings: SettingsStore;
	relations: RelationCache;
	sorter: GroupSorter;
	colors: GroupColors;
	trees: TreeIntegration;
	dialogs: DialogIntegration;
	viewMenu: ViewMenu;
	/** Zotero.Notifier-Observer ("bookgroup-items", "bookgroup-view") */
	observerIDs: string[];
	/** Zotero.Prefs-Observer für Zoteros eigene Prefs (sortCreatorAsString) */
	prefObserverIDs: symbol[];
	/** Gruppierung des Hauptbaums muss nach einem Update noch wiederhergestellt werden */
	pendingRestore: boolean;
}
```

Den Observer `bookgroup-relations` verwaltet `RelationCache` selbst, die Observer der Plugin-Prefs verwaltet `SettingsStore`.

---

## `SettingsStore`

`src/modules/settings.ts`. Zwischengespeicherte, validierte Sicht auf die Preferences.

### Typen

```ts
type BaseSort = "creator" | "title";
type ColorMode = "fixed" | "random";

interface Settings {
	enable: boolean;
	citationDialog: boolean;
	baseSort: BaseSort;
	indent: number; // 0–64
	bgEnabled: boolean;
	bgColor: string; // "#rrggbb"
	contourEnabled: boolean;
	contourColor: string; // "#rrggbb"
	colorMode: ColorMode;
}

type SettingKey = keyof Settings | "groupColors" | "restoreGroupSort";
```

### Mitglieder

| Mitglied                                                             | Rückgabe     | Beschreibung                                                                                                                        |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `current`                                                            | `Settings`   | Getter. Liest beim ersten Zugriff und nach jeder Pref-Änderung neu, sonst aus dem Cache.                                            |
| `static read()`                                                      | `Settings`   | Liest und validiert alle Werte direkt aus `Zotero.Prefs`.                                                                           |
| `static getRaw(key: SettingKey)`                                     | `unknown`    | Unvalidierter Rohwert.                                                                                                              |
| `static setRaw(key: SettingKey, value: string \| number \| boolean)` | `void`       | Schreibt einen Rohwert (mit Präfix `extensions.zotero.bookgroup.`).                                                                 |
| `onChange(listener: (key: SettingKey) => void)`                      | `() => void` | Meldet einen Listener an. Gibt eine Funktion zum Abmelden zurück. Fehler im Listener werden protokolliert und nicht weitergereicht. |
| `register()`                                                         | `void`       | Meldet Pref-Observer für alle Schlüssel außer `restoreGroupSort` an (idempotent).                                                   |
| `unregister()`                                                       | `void`       | Meldet alle Observer und Listener ab.                                                                                               |

Validierungsregeln von `read()`:

- `enable`, `citationDialog`, `bgEnabled`, `contourEnabled`: alles außer `false` gilt als `true`.
- `baseSort`: nur `"title"` ergibt `"title"`, sonst `"creator"`.
- `colorMode`: nur `"random"` ergibt `"random"`, sonst `"fixed"`.
- `indent`: Ganzzahl, begrenzt auf 0–64; nicht lesbar → `16`.
- `bgColor`, `contourColor`: keine `#rrggbb`-Farbe → `#4f8ff7`.

### Beispiel

```js
const { settings } = Zotero.BookGroup.api.getServices();
const off = settings.onChange((key) => Zotero.debug(`Book Group: ${key} geändert`));
Zotero.Prefs.set("extensions.zotero.bookgroup.indent", 24, true);
// settings.current.indent === 24
off();
```

---

## `RelationCache`

`src/modules/relationCache.ts`. Hält den `RelationIndex` mit den Zotero-Relationen synchron.

| Mitglied                         | Rückgabe        | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readonly index`                 | `RelationIndex` | Der aktuelle Index (Instanz bleibt über Rebuilds gleich).                                                                                                                                                                                                                                                                                                                                                                       |
| `onChange(listener: () => void)` | `() => void`    | Listener für geänderte Zuordnungen; gibt die Abmeldefunktion zurück.                                                                                                                                                                                                                                                                                                                                                            |
| `init()`                         | `Promise<void>` | Meldet den Notifier-Observer `bookgroup-relations` (Typ `item`, Priorität 40) an und baut den Index auf.                                                                                                                                                                                                                                                                                                                        |
| `rebuild()`                      | `Promise<void>` | Vollständiger Neuaufbau aus der Datenbank. Für Beiträge mit mehreren Sammelwerken werden dabei Buchtitel und Herausgeber geladen und verglichen (siehe `markMetadataMatches`). Läuft bereits ein Aufbau, wird genau ein Folgeaufbau vorgemerkt und das laufende Promise zurückgegeben. Wurde während des Ladens ein Item gelöscht, wird neu geladen. Listener werden nur benachrichtigt, wenn sich eine Zuordnung geändert hat. |
| `scheduleRebuild()`              | `void`          | Plant `rebuild()` nach 300 ms; erneute Aufrufe verschieben den Zeitpunkt.                                                                                                                                                                                                                                                                                                                                                       |
| `isPending`                      | `boolean`       | Getter: `true`, solange ein Rebuild geplant ist oder läuft.                                                                                                                                                                                                                                                                                                                                                                     |
| `destroy()`                      | `void`          | Meldet den Observer ab, bricht den Timer ab, entfernt Listener. Laufende Aufbauten schreiben danach nicht mehr in den Index.                                                                                                                                                                                                                                                                                                    |

Verhalten des Observers:

| Ereignis | Verarbeitung                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `delete` | Löschzähler erhöhen, IDs sofort entfernen, bei Änderung Listener benachrichtigen                      |
| `trash`  | Wenn relevant: IDs sofort entfernen (bei Änderung Listener benachrichtigen), dann `scheduleRebuild()` |
| sonstige | Wenn relevant: `scheduleRebuild()`                                                                    |

„Relevant“ heißt: Eine der IDs steht im Index, oder das Item gehört zu einem Gruppierungstyp.

### Beispiel: Index sofort neu aufbauen

```js
const { relations } = Zotero.BookGroup.api.getServices();
await relations.rebuild();
return relations.index.linkCount;
```

---

## `RelationIndex` und `resolveLinks`

`src/modules/core/relationIndex.ts`. Reine Logik ohne Zotero-Abhängigkeiten.

### Typen

```ts
type ItemKind = "container" | "contribution";

interface GroupLink {
	containerID: number;
	contributionID: number;
	// Buchtitel und mindestens ein Herausgeber passen; nur bei mehrdeutigen
	// Beiträgen gesetzt
	metadataMatch?: boolean;
}

interface VolumeMetadata {
	volumeTitle: string; // Sammelwerk: Titel; Beitrag: Buch-/Enzyklopädietitel
	editors: string[]; // normalisierte Namen, siehe creatorKey()
}

interface CandidateItem {
	id: number;
	libraryID: number;
	key: string;
	kind: ItemKind;
}

interface RelationRow {
	subjectID: number; // Item, auf dem die Relation gespeichert ist
	objectLibraryID: number;
	objectKey: string;
}
```

### `resolveLinks(candidates, rows): GroupLink[]`

| Parameter    | Typ                       | Beschreibung                     |
| ------------ | ------------------------- | -------------------------------- |
| `candidates` | `Iterable<CandidateItem>` | Alle Items der Gruppierungstypen |
| `rows`       | `Iterable<RelationRow>`   | `dc:relation`-Zeilen             |

Gibt die Verknüpfungen zurück. Eine Zeile wird ignoriert, wenn:

- Subjekt oder Objekt kein Kandidat ist,
- Subjekt und Objekt verschiedenen Bibliotheken angehören,
- beide dieselbe Art haben (z. B. Buch ↔ Buch).

Dieselbe Verknüpfung aus beiden Richtungen erscheint nur einmal.

```ts
resolveLinks(
	[
		{ id: 1, libraryID: 1, key: "BOOK", kind: "container" },
		{ id: 2, libraryID: 1, key: "SEC", kind: "contribution" },
	],
	[
		{ subjectID: 1, objectLibraryID: 1, objectKey: "SEC" },
		{ subjectID: 2, objectLibraryID: 1, objectKey: "BOOK" },
	],
);
// → [{ containerID: 1, contributionID: 2 }]
```

### Auswahl bei mehreren Sammelwerken

| Funktion                                                | Rückgabe   | Beschreibung                                                                                                                                                       |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `normalizeText(value)`                                  | `string`   | Unicode-NFC, Leerraum zusammengefasst und getrimmt, kleingeschrieben. `null`/`undefined` → `""`.                                                                   |
| `creatorKey({ firstName, lastName })`                   | `string`   | `"nachname\|vorname"` in normalisierter Form; `""` bei leerem Namen.                                                                                               |
| `matchesVolume(contribution, container)`                | `boolean`  | `true`, wenn der normalisierte Buchtitel des Beitrags gleich dem Titel des Sammelwerks ist (und nicht leer) **und** mindestens ein Herausgeber in beiden vorkommt. |
| `findAmbiguousContributions(links)`                     | `number[]` | IDs der Beiträge, die mit mehr als einem Sammelwerk verknüpft sind.                                                                                                |
| `markMetadataMatches(links, contributionIDs, metadata)` | `void`     | Setzt `metadataMatch` auf allen Verknüpfungen der genannten Beiträge. Fehlen Metadaten für Beitrag oder Sammelwerk, gilt das als keine Übereinstimmung.            |

```ts
const links = [
	{ containerID: 1, contributionID: 10 }, // Festschrift
	{ containerID: 5, contributionID: 10 }, // Kommentar
];
markMetadataMatches(
	links,
	findAmbiguousContributions(links),
	new Map([
		[
			10,
			{
				volumeTitle: "Kommentar",
				editors: [creatorKey({ lastName: "Weber" })],
			},
		],
		[
			1,
			{
				volumeTitle: "Festschrift",
				editors: [creatorKey({ lastName: "Weber" })],
			},
		],
		[
			5,
			{
				volumeTitle: "Kommentar",
				editors: [creatorKey({ lastName: "Weber" })],
			},
		],
	]),
);
new RelationIndex(links).getParentID(10); // 5: Titel und Herausgeber passen
```

### Klasse `RelationIndex`

| Mitglied                                   | Rückgabe                                 | Beschreibung                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(links?: Iterable<GroupLink>)` |                                          | Baut den Index aus den Verknüpfungen auf.                                                                                                                                                                                                                                                             |
| `rebuild(links: Iterable<GroupLink>)`      | `boolean`                                | Ersetzt den gesamten Index. Selbstverknüpfungen werden ignoriert. Bei mehreren Sammelwerken gewinnt eines mit `metadataMatch`; unter gleichwertigen Kandidaten entscheidet die kleinste ID. `true`, wenn sich eine Zuordnung Beitrag → Sammelwerk geändert hat (auch hinzugekommen oder weggefallen). |
| `removeItems(ids: Iterable<number>)`       | `boolean`                                | Entfernt IDs auf beiden Seiten. Wird ein Sammelwerk entfernt, verlieren seine Beiträge ihre Zuordnung. `true`, wenn sich etwas geändert hat.                                                                                                                                                          |
| `getParentID(childID: number)`             | `number \| undefined`                    | Sammelwerk eines Beitrags                                                                                                                                                                                                                                                                             |
| `getChildIDs(parentID: number)`            | `readonly number[]`                      | Beiträge eines Sammelwerks, aufsteigend nach ID; leeres Array, wenn keine                                                                                                                                                                                                                             |
| `isChild(id)` / `isParent(id)` / `has(id)` | `boolean`                                | Rollenabfragen; `has` = `isChild \|\| isParent`                                                                                                                                                                                                                                                       |
| `parents`                                  | `ReadonlyMap<number, readonly number[]>` | Getter: `Map<parentID, childIDs>`                                                                                                                                                                                                                                                                     |
| `linkCount`                                | `number`                                 | Getter: Anzahl zugeordneter Beiträge                                                                                                                                                                                                                                                                  |

```ts
const index = new RelationIndex([
	{ containerID: 30, contributionID: 5 },
	{ containerID: 7, contributionID: 5 },
]);
index.getParentID(5); // 7 (keine Metadaten markiert → kleinste Sammelwerk-ID)
index.getChildIDs(30); // []
index.rebuild([{ containerID: 7, contributionID: 5 }]); // false, unverändert
```

### Beispiel: Beiträge des ausgewählten Buchs anzeigen

```js
const { relations } = Zotero.BookGroup.api.getServices();
const [book] = Zotero.getActiveZoteroPane().getSelectedItems();
return relations.index.getChildIDs(book.id).map((id) => Zotero.Items.get(id).getDisplayTitle());
```

---

## `GroupSorter`

`src/modules/groupSorter.ts`.

```ts
type VisibilityCheck = (id: number) => boolean;
```

| Mitglied                                                                                      | Rückgabe              | Beschreibung                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(relations: RelationCache, settings: SettingsStore)`                              |                       |                                                                                                                                                                                                                                                                |
| `invalidate()`                                                                                | `void`                | Verwirft die zwischengespeicherten Basisschlüssel.                                                                                                                                                                                                             |
| `getVisibleParentID(itemID: number, isVisible: VisibilityCheck)`                              | `number \| undefined` | Sammelwerk des Items, aber nur, wenn `isVisible(parentID)` wahr ist.                                                                                                                                                                                           |
| `hasVisibleChildren(itemID: number, isVisible: VisibilityCheck)`                              | `boolean`             | `true`, wenn mindestens ein Beitrag sichtbar ist.                                                                                                                                                                                                              |
| `getEntry(item: unknown, isVisible: VisibilityCheck)`                                         | `GroupEntry \| null`  | Ordnungseintrag für jedes `Zotero.Item`. Eigenständige Notizen und Anhänge sind ihr eigener Gruppen-Root; nur reguläre Items werden einem sichtbaren Sammelwerk untergeordnet. `null` für alles, was kein `Zotero.Item` ist (Sammlungen/Suchen im Papierkorb). |
| `compare(a, b, direction, compareStrings, isVisible, entryCache?)`                            | `number \| null`      | Vergleich zweier Zeilenobjekte (siehe unten).                                                                                                                                                                                                                  |
| `sortContributions(ids: number[], compareStrings: StringCompare, isVisible: VisibilityCheck)` | `number[]`            | Sortiert Beiträge eines Sammelwerks nach erster Seite, Titel, ID. IDs, die keinen Eintrag ergeben, fallen weg.                                                                                                                                                 |
| `describe(item: Zotero.Item, pageLabel: (page: string) => string)`                            | `string`              | Text der Spalte „Sammelwerk“: `Sammelwerktitel › S. 12-34`, nur der Sammelwerktitel (Beitrag ohne Seiten), der eigene Titel (Sammelwerk) oder `""`. Keine Sichtbarkeitsprüfung.                                                                                |

Parameter von `compare`:

| Parameter        | Typ                               | Beschreibung                                                         |
| ---------------- | --------------------------------- | -------------------------------------------------------------------- |
| `a`, `b`         | `unknown`                         | Zeilenobjekte, normalerweise `Zotero.Item`                           |
| `direction`      | `number`                          | `1` aufsteigend, `-1` absteigend                                     |
| `compareStrings` | `StringCompare`                   | z. B. `(x, y) => Zotero.getLocaleCollation().compareString(1, x, y)` |
| `isVisible`      | `VisibilityCheck`                 | Prüft, ob ein Sammelwerk in der aktuellen Ansicht ist                |
| `entryCache`     | `Map<number, GroupEntry \| null>` | Optional; Einträge für die Dauer eines Sortierdurchlaufs             |

Rückgabe von `compare`:

| Fall                      | Rückgabe                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Beide Objekte sind Items  | `compareGroupEntries(...)`; der Wert ist dafür gedacht, vom Aufrufer mit `direction` multipliziert zu werden |
| Genau eines ist kein Item | `-1`, wenn `a` kein Item ist, sonst `1` (Nicht-Items vorn)                                                   |
| Keines ist ein Item       | `null` (der Aufrufer vergleicht nach Titel)                                                                  |

### Beispiel: Items in gruppierter Reihenfolge sortieren

```js
const { sorter } = Zotero.BookGroup.api.getServices();
const collation = Zotero.getLocaleCollation();
const items = Zotero.getActiveZoteroPane().getSelectedItems();
const direction = 1;
items.sort(
	(a, b) =>
		(sorter.compare(
			a,
			b,
			direction,
			(x, y) => collation.compareString(1, x, y),
			() => true, // alle Sammelwerke als sichtbar behandeln
		) ?? 0) * direction,
);
return items.map((item) => item.getDisplayTitle());
```

---

## Ordnungsfunktionen (`core/groupOrder.ts`)

`src/modules/core/groupOrder.ts`. Reine Funktionen, in Node testbar.

```ts
type StringCompare = (a: string, b: string) => number;

interface GroupEntry {
	id: number;
	rootID: number; // eigene ID oder ID des Sammelwerks
	rootKey: readonly string[]; // Basisschlüssel des Gruppen-Roots
	rank: 0 | 1; // 0 = Gruppen-Root, 1 = Beitrag
	pageStart: number | null;
	title: string;
}
```

| Funktion                                             | Rückgabe          | Beschreibung                                                                                               |
| ---------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `parseRoman(input: string)`                          | `number \| null`  | Römische Zahl in Kleinbuchstaben; ungültig → `null`. `parseRoman("xiv")` → `14`                            |
| `parsePageStart(pages: string \| null \| undefined)` | `number \| null`  | Erste Seite eines `pages`-Werts, siehe unten                                                               |
| `compareKeyTuples(a, b, compare)`                    | `number`          | Komponentenweiser Vergleich; leere Werte stehen hinten                                                     |
| `compareWithinGroup(a, b, compare)`                  | `number`          | Rang, erste Seite (ohne Seiten hinten), Titel, ID                                                          |
| `compareGroupEntries(a, b, direction, compare)`      | `number`          | Basisschlüssel, dann `rootID`, dann `compareWithinGroup × sign(direction)`; `0` nur bei gleicher ID        |
| `hslToHex(h: number, s: number, l: number)`          | `string`          | HSL (Grad, Prozent, Prozent) → `#rrggbb`                                                                   |
| `randomGroupColor(random?: () => number)`            | `string`          | Zufällige Farbe: Farbton 0–359, Sättigung 55–74 %, Helligkeit 45–56 %; `random` ist für Tests austauschbar |
| `isHexColor(value: unknown)`                         | `value is string` | `true` für `#rrggbb` (Groß-/Kleinschreibung egal)                                                          |

Regeln von `parsePageStart` (Text wird getrimmt und kleingeschrieben):

1. **Seitenmarke hat Vorrang:** `s`, `p`, `pp`, `seite(n)`, `page(s)`, optional mit Punkt, gefolgt von einer arabischen oder römischen Zahl.
2. Sonst: die erste arabische Zahl, außer eine römische Zahl steht davor. Einzelbuchstaben zählen nur bei `i`, `v`, `x` als römisch; mehrere Buchstaben aus `ivxlcdm` immer.
3. Römische Seitenzahlen ergeben `−100000 + Wert` und stehen damit vor Seite 1.
4. Nichts gefunden → `null`.

| Eingabe                  | Ergebnis               |
| ------------------------ | ---------------------- |
| `"12-34"`                | `12`                   |
| `"S. 101–120"`           | `101`                  |
| `"Bd. 2, S. 45-60"`      | `45`                   |
| `"vol. 3, pp. 17–30"`    | `17`                   |
| `"S. xii"`, `"xii–xv"`   | `−99988` (vor Seite 1) |
| `"c. 12"`, `"d 5"`       | `12`, `5`              |
| `""`, `null`, `"passim"` | `null`                 |

### Beispiel: Richtungskompensation

```ts
const collator = new Intl.Collator("de", { numeric: true });
const cmp = (a: string, b: string) => collator.compare(a, b);
const sortLikeZotero = (entries: GroupEntry[], direction: number) =>
	[...entries].sort((a, b) => compareGroupEntries(a, b, direction, cmp) * direction);
// Absteigend: Gruppen in umgekehrter Reihenfolge,
// innerhalb der Gruppe weiterhin Sammelwerk → Beiträge nach Seiten.
```

---

## `GroupColors`

`src/modules/groupColors.ts`. Zufällige, persistente Farbe je Sammelwerk (Pref `groupColors`, Schlüssel `libraryID/itemKey`).

| Mitglied                                                     | Rückgabe         | Beschreibung                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getColor(itemID: number)`                                   | `string \| null` | Farbe des Sammelwerks; wird beim ersten Aufruf erzeugt und nach 250 ms gespeichert. `null`, wenn das Item nicht geladen werden kann.                                                    |
| `forget(entries: Array<{ libraryID: number; key: string }>)` | `void`           | Entfernt Farben gelöschter Sammelwerke (Speichern nach 250 ms).                                                                                                                         |
| `reset()`                                                    | `void`           | Leert die Tabelle und speichert sofort (Pref = `"{}"`).                                                                                                                                 |
| `onPreferenceChanged()`                                      | `boolean`        | Reaktion auf eine Änderung der Pref. `false` bei eigenem Schreibvorgang. Sonst `true`; die Tabelle wird beim nächsten Zugriff neu geladen, außer ein eigener Speichervorgang steht aus. |
| `flush()`                                                    | `void`           | Schreibt ausstehende Änderungen sofort (Entladen eines Hauptfensters, Shutdown).                                                                                                        |

```js
const { colors, trees } = Zotero.BookGroup.api.getServices();
colors.reset();
await trees.refresh();
```

---

## `TreeIntegration`

`src/modules/treeIntegration.ts`. Patches und Dekoration der Eintragslisten.

### Typen

```ts
interface SortCollation {
	compareString(level: number, a: string, b: string): number;
}

// Strukturtyp für Zoteros ItemTree (nur die verwendeten Teile)
interface ItemTreeLike {
	props: { id: string };
	domEl?: Element;
	tree?: { invalidate(): void; _columns?: VirtualizedTableColumns } | null;
	rowProvider?: RowProviderLike;
	getRow(index: number): TreeRow | undefined;
	getSortField(): string;
	_sortedColumn?: { dataKey: string; sortDirection?: number } | null;
	sort(): Promise<unknown> | unknown;
	forceUpdate?(callback?: () => void): void;
	invalidateRowCache?(ids: number[] | true): void;
}
```

### Mitglieder

| Mitglied                                                                         | Rückgabe         | Beschreibung                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(settings: SettingsStore, sorter: GroupSorter, colors: GroupColors)` |                  |                                                                                                                                                                                                                                                                           |
| `columnKey`                                                                      | `string \| null` | Namespaced `dataKey` der registrierten Spalte (in `onStartup` gesetzt, nach `destroy()` `null`).                                                                                                                                                                          |
| `attach(win: Window)`                                                            | `boolean`        | Patcht `_renderItem`, `_compareField`, `_sort` und – falls vorhanden – `buildColumnPickerMenu` der ItemTree-Klassen des Fensters (idempotent) und rendert die Bäume per `forceUpdate` neu. `false` nach `destroy()`, wenn die Interna fehlen oder ein Patch nicht greift. |
| `detach(win: Window)`                                                            | `void`           | Löst das Fenster; stellt die Originale wieder her, sobald kein Fenster den Prototyp mehr nutzt; entfernt Klassen und rendert per `forceUpdate` neu.                                                                                                                       |
| `destroy()`                                                                      | `void`           | Setzt `destroyed`, bricht einen geplanten Resort ab, löst alle Fenster, setzt `columnKey = null`.                                                                                                                                                                         |
| `static getTrees(win: Window)`                                                   | `ItemTreeLike[]` | Eintragslisten eines Fensters: `ZoteroPane.itemsView`, `libraryLayout.itemsView`, `itemsView`.                                                                                                                                                                            |
| `isTreeActive(tree: ItemTreeLike \| undefined)`                                  | `boolean`        | `false` nach `destroy()` oder bei `enable = false`. Sonst `true` für die Baum-ID `main` und für Dialog-Bäume (`isDialogTree`), wenn `citationDialog` an ist.                                                                                                              |
| `isDialogTree(tree: ItemTreeLike)`                                               | `boolean`        | Baum-ID in `DIALOG_TREE_IDS` **und** Fenster-URL (`tree.domEl.ownerGlobal.location.href`) beginnt mit einer der `DIALOG_URLS`. Pro Baum zwischengespeichert.                                                                                                              |
| `isGroupSorted(tree: ItemTreeLike)`                                              | `boolean`        | Baum ist nach der Plugin-Spalte sortiert. Löst `getSortField()` eine Ausnahme aus (Baum ohne Spalten), ergibt das `false`.                                                                                                                                                |
| `activate(tree: ItemTreeLike)`                                                   | `boolean`        | Sortiert nach der Plugin-Spalte. `true`, wenn der Baum danach nach ihr sortiert ist.                                                                                                                                                                                      |
| `deactivate(tree: ItemTreeLike)`                                                 | `boolean`        | Sortiert einen gruppierten Baum nach `title`. `true`, wenn er nicht gruppiert war oder danach nach Titel sortiert ist.                                                                                                                                                    |
| `forEachTree(callback: (tree, win) => void)`                                     | `void`           | Ruft `callback` für jeden Baum aller angebundenen Fenster auf; entfernt geschlossene Fenster; Fehler werden protokolliert.                                                                                                                                                |
| `refresh({ resort }?: { resort?: boolean })`                                     | `Promise<void>`  | Rendert alle Bäume neu. Mit `resort: true` wird bei gruppierten Bäumen vorher der Row-Cache verworfen und `tree.sort()` aufgerufen.                                                                                                                                       |
| `scheduleResort()`                                                               | `void`           | Plant `refresh({ resort: true })` nach 50 ms; erneute Aufrufe verschieben den Zeitpunkt. Nach `destroy()` wirkungslos.                                                                                                                                                    |

`activate`/`deactivate` lösen die Sortierung über `Columns.toggleSort()` aus. Ob danach die gewünschte Spalte aktiv ist, wird sofort über `getSortField()` geprüft. Das eigentliche Neusortieren durch Zotero läuft asynchron.

### Verhalten der Patches

| Methode                                       | Verhalten, solange die Patches aktiv sind                                                                                                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ItemTree.prototype._renderItem`              | Original aufrufen, dann Klassen der Zeile zurücksetzen und je nach Rolle neu setzen. Dialog-Bäume werden beim ersten Rendern einmalig auf die Gruppierungsspalte umgeschaltet.                                                                                                         |
| `ItemTreeRowProvider.prototype._compareField` | Bei `sortField === columnKey` und aktivem Baum: `GroupSorter.compare()` mit der Richtung aus `itemTree._sortedColumn.sortDirection`; Ergebnis × Spaltenrichtung × Provider-Richtung. `null` → Titelvergleich des Originals, Ausnahme → `0`. Sonst Original.                            |
| `ItemTreeRowProvider.prototype._sort`         | Bei `itemIDs`, aktivem und gruppiertem Baum: `itemIDs = null` (vollständige Sortierung). Sonst Original.                                                                                                                                                                               |
| `ItemTree.prototype.buildColumnPickerMenu`    | Original aufrufen; ist das Popup `#zotero-column-picker` (Rechtsklick auf eine Spaltenüberschrift) und der Baum aktiv, den Eintrag `#bookgroup-column-picker-sort` vor `[anonid="zotero-column-picker-sort-menu"]` einfügen (Fallback: Trenner und Eintrag am Ende). Optionaler Patch. |

Nach dem Wiederherstellen reichen alle Patch-Funktionen an die Originale durch (`enabled = false`), auch wenn React sie noch gebunden hält.

### Beispiel: Hauptliste gruppieren und wieder lösen

```js
const { trees } = Zotero.BookGroup.api.getServices();
const tree = Zotero.getActiveZoteroPane().itemsView;
if (!trees.activate(tree)) {
	throw new Error("Gruppierungsspalte nicht verfügbar");
}
// ...
trees.deactivate(tree);
```

---

## `DialogIntegration`

`src/modules/dialogIntegration.ts`. Integration in „Zitation hinzufügen/bearbeiten“ und „Literaturverzeichnis bearbeiten“.

| Mitglied                                                  | Rückgabe | Beschreibung                                                                                                                                        |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constructor(trees, sorter, relations, settings, colors)` |          |                                                                                                                                                     |
| `register()`                                              | `void`   | Setzt `destroyed` zurück, meldet einen `Services.wm`-Listener an und bindet bereits offene Dialoge ein (idempotent).                                |
| `unregister()`                                            | `void`   | Setzt `destroyed`, meldet den Listener ab und löst alle Dialoge. Danach ignorieren noch ausstehende `load`-Listener und `groupList()` jeden Aufruf. |
| `applyCSSVariables()`                                     | `void`   | Setzt die CSS-Variablen in allen offenen Dialogen neu.                                                                                              |
| `refreshLists()`                                          | `void`   | Gruppiert die Listenansicht aller offenen Zitationsdialoge neu. Ist das Plugin oder die Dialog-Option aus, werden nur die Klassen entfernt.         |

Beim Umgruppieren der Listenansicht (`groupList`):

- Pro `.itemsContainer` wird die Zielreihenfolge berechnet. Nur falsch platzierte Knoten werden mit `insertBefore` verschoben.
- War der erste aktivierbare Eintrag (`#list-layout .item:not([disabled])`) als `current` vorausgewählt und höchstens ein Eintrag ausgewählt, gehen `current`/`selected` auf den neuen ersten Eintrag über. Danach wird `listLayout.updateSelectedItems()` aufgerufen.
- Hat ein fokussierter Knoten den Fokus verloren, erhält er ihn zurück.

---

## Menüeintrag (`groupSortMenu.ts`)

`src/modules/groupSortMenu.ts`. Gemeinsamer Eintrag für **Ansicht → Sortieren nach** und das Kontextmenü der Spaltenüberschrift.

| Export                                                                               | Rückgabe           | Beschreibung                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MENU_CLASS`                                                                         | `"bookgroup-menu"` | Klasse aller vom Plugin eingefügten Menüelemente (für das Aufräumen).                                                                                  |
| `createGroupSortMenuItem(doc: Document, tree: ItemTreeLike, trees: TreeIntegration)` | `Element`          | Checkbox-`menuitem` „Nach Sammelwerk gruppieren“; `checked` = `trees.isGroupSorted(tree)`; `command` schaltet zwischen `activate` und `deactivate` um. |
| `createMenuSeparator(doc: Document)`                                                 | `Element`          | `menuseparator` mit `MENU_CLASS`.                                                                                                                      |

---

## `ViewMenu`

`src/modules/viewMenu.ts`. Menüeintrag „Nach Sammelwerk gruppieren“ unter **Ansicht → Sortieren nach**.

| Mitglied                                                       | Rückgabe | Beschreibung                                                                                      |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `constructor(trees: TreeIntegration, settings: SettingsStore)` |          |                                                                                                   |
| `attach(win: Window)`                                          | `void`   | Meldet einen `popupshowing`-Listener auf `#sort-submenu` an. Ohne dieses Element passiert nichts. |
| `detach(win: Window)`                                          | `void`   | Entfernt Listener und eingefügte Menüelemente (Klasse `bookgroup-menu`).                          |

Der Eintrag entsteht über `createGroupSortMenuItem()`, hat die ID `bookgroup-menuitem-sort` und schaltet zwischen `activate` und `deactivate` des Hauptbaums um. Im Kontextmenü der Spaltenüberschrift heißt derselbe Eintrag `bookgroup-column-picker-sort` (siehe [Verhalten der Patches](#verhalten-der-patches)).

---

## Sortierspalte (`column.ts`)

`src/modules/column.ts`.

| Funktion                                     | Rückgabe         | Beschreibung                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registerGroupColumn(sorter: GroupSorter)`   | `string \| null` | Registriert die Spalte `groupSortKey` für die Bäume `main`, `citationDialog`, `select-items-dialog`, `edit-bib-select-item-dialog`; `showInColumnPicker: true`, `columnPickerSubMenu: true`, `zoteroPersist: ["width", "hidden", "sortDirection"]`. Gibt den namespaced Schlüssel zurück, `null` bei Fehler. |
| `unregisterGroupColumn(key: string \| null)` | `void`           | Meldet die Spalte ab (keine Aktion bei `null`).                                                                                                                                                                                                                                                              |

---

## Styles (`styles.ts`)

`src/modules/styles.ts`.

```ts
type GroupRole = "parent" | "child" | "member";
```

| Funktion                                                   | Rückgabe | Beschreibung                                                                                                                                                                 |
| ---------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerStylesheet(win: Window, settings: Settings)`      | `void`   | Fügt `<link id="bookgroup-stylesheet">` auf `chrome://bookgroup/content/bookgroup.css` ein (idempotent) und setzt die CSS-Variablen.                                         |
| `unregisterStylesheet(win: Window)`                        | `void`   | Entfernt Stylesheet und Variablen.                                                                                                                                           |
| `applyCSSVariables(win: Window, settings: Settings)`       | `void`   | Setzt `--bookgroup-indent`, `--bookgroup-bg-color`, `--bookgroup-contour-color` auf dem Wurzelelement.                                                                       |
| `clearGroupStyle(element: HTMLElement)`                    | `void`   | Entfernt alle `bookgroup-*`-Klassen und `--bookgroup-group-color`.                                                                                                           |
| `applyGroupStyle(element, role, rootID, settings, colors)` | `void`   | Setzt Klassen je Rolle (siehe Tabelle unten). Im Modus `random` mit aktivem Hintergrund oder aktiver Kontur zusätzlich `--bookgroup-group-color` mit der Farbe von `rootID`. |

| Rolle    | Verwendet für                                                   | Klassen                                                   |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| `parent` | Sammelwerk mit mindestens einem sichtbaren Beitrag              | `bookgroup-parent`, `bookgroup-contour`¹, `bookgroup-bg`² |
| `child`  | Beitrag mit sichtbarem Sammelwerk, sowie dessen Anhänge/Notizen | `bookgroup-child`, `bookgroup-contour`¹                   |
| `member` | Anhänge/Notizen eines Sammelwerks                               | `bookgroup-contour`¹                                      |

¹ nur wenn `contourEnabled`. ² nur wenn `bgEnabled`.

---

## Preference-Pane (`preferencePane.ts`)

| Funktion                                                     | Rückgabe | Beschreibung                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerPreferencePane()`                                   | `void`   | Registriert `content/preferences.xhtml` mit Beschriftung „Book Group“, Icon `content/icons/favicon.svg` und Stylesheet `content/preferences.css`. Zotero entfernt den Pane beim Shutdown selbst.                                 |
| `initPreferencePane(win: Window, onResetColors: () => void)` | `void`   | Richtet die beiden Farbfelder ein (siehe unten), aktualisiert die Einrückungsanzeige und den Aktivierungszustand von Farbfeldern und Reset-Button; `onResetColors` wird beim Klick auf „Neue Zufallsfarben vergeben“ aufgerufen. |

| Konstante       | Wert                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `COLOR_PALETTE` | `#4f8ff7` (Blau, Standard), `#2ea8e5`, `#009980`, `#5fb236`, `#e0b400`, `#ff8c19`, `#ff6666`, `#a6507b`, `#a28ae5`, `#999999` |

Die Farbfelder sind Zoteros `<color-picker>`-Element (`chrome://zotero/content/elements/colorPicker.js`). `initPreferencePane()` lädt das Skript, falls das Element im Einstellungsfenster noch nicht definiert ist, und setzt `cols="5"`, `colors` (`COLOR_PALETTE`) und `colorLabels` (lokalisierte Namen aus der FTL-Nachricht `color-names`). Das Element hat keine `preference`-Bindung:

- Ein `MutationObserver` auf dem Attribut `color` schreibt eine neue Auswahl in `bgColor` bzw. `contourColor`.
- Ein Pref-Observer überträgt Änderungen der Pref zurück in das Element.
- Gesperrt wird über den inneren `button`, weil die `disabled`-Eigenschaft des Elements diesen nicht erreicht.

---

## Item-Typen (`itemTypes.ts`)

| Funktion                  | Rückgabe                | Beschreibung                                                                                                         |
| ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `getTypeKinds()`          | `Map<number, ItemKind>` | `itemTypeID` → `"container"` (`book`) / `"contribution"` (`bookSection`, `encyclopediaArticle`), einmalig berechnet. |
| `safeGetItem(id: number)` | `Zotero.Item \| null`   | Wie `Zotero.Items.get()`, aber `null` statt Ausnahme bzw. `false`.                                                   |

---

## Konstanten (`constants.ts`)

| Konstante              | Wert                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `CONTAINER_TYPES`      | `["book"]` (Zotero kennt keinen eigenen Enzyklopädie-Typ; Enzyklopädien werden als Buch erfasst)                               |
| `CONTRIBUTION_TYPES`   | `["bookSection", "encyclopediaArticle"]`                                                                                       |
| `COLUMN_DATA_KEY`      | `"groupSortKey"`                                                                                                               |
| `MAIN_TREE_ID`         | `"main"`                                                                                                                       |
| `DIALOG_TREE_IDS`      | `["citationDialog", "select-items-dialog", "edit-bib-select-item-dialog"]`                                                     |
| `DIALOG_URLS`          | `chrome://zotero/content/integration/citationDialog.xhtml`, `chrome://zotero/content/integration/editBibliographyDialog.xhtml` |
| `CSS_CLASSES`          | `{ parent: "bookgroup-parent", child: "bookgroup-child", contour: "bookgroup-contour", background: "bookgroup-bg" }`           |
| `ALL_CSS_CLASSES`      | Werte von `CSS_CLASSES`                                                                                                        |
| `GROUP_COLOR_PROPERTY` | `"--bookgroup-group-color"`                                                                                                    |
| `STYLESHEET_ID`        | `"bookgroup-stylesheet"`                                                                                                       |
| `REBUILD_DELAY`        | `300` (ms, Entprellung des Relations-Rebuilds)                                                                                 |
| `RESORT_DELAY`         | `50` (ms, Zusammenfassung von Resorts)                                                                                         |

---

## CSS-Klassen und CSS-Variablen

Definiert in `addon/content/bookgroup.css`. Die Klassen werden gesetzt auf

- Zeilen der Eintragslisten: `.virtualized-table .row` (Hauptfenster, Bibliotheksansicht des Zitationsdialogs, Literaturverzeichnis-Dialog),
- Ergebnisknoten der Listenansicht des Zitationsdialogs: `#list-layout .item`.

### Klassen

| Klasse              | Bedeutung                            | Wirkung in der Baumansicht                                                                                                                 | Wirkung in der Listenansicht                   |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `bookgroup-parent`  | Sammelwerk einer sichtbaren Gruppe   | Nur zusammen mit `bookgroup-bg` sichtbar                                                                                                   | Nur zusammen mit `bookgroup-bg` sichtbar       |
| `bookgroup-child`   | Beitrag (und dessen Anhänge/Notizen) | `padding-inline-start: var(--bookgroup-indent)` auf `.cell.first-column`                                                                   | `margin-inline-start: var(--bookgroup-indent)` |
| `bookgroup-contour` | Zeile gehört zu einer Gruppe         | `::before`, 3 px breit am Zeilenanfang, Farbe `--bookgroup-group-color` bzw. `--bookgroup-contour-color`                                   | `box-shadow: inset 3px 0 0 …`                  |
| `bookgroup-bg`      | Hintergrund für das Sammelwerk       | Mit `bookgroup-parent` und ohne `.selected`: `background-image` in Gruppenfarbe bzw. `--bookgroup-bg-color`, 22 % gemischt mit transparent | wie Baumansicht                                |

### Variablen

| Variable                    | Gesetzt auf                    | Quelle                          | Fallback im CSS                        |
| --------------------------- | ------------------------------ | ------------------------------- | -------------------------------------- |
| `--bookgroup-indent`        | `:root` jedes Fensters/Dialogs | Pref `indent` in px             | `16px`                                 |
| `--bookgroup-bg-color`      | `:root`                        | Pref `bgColor`                  | `#4f8ff7`                              |
| `--bookgroup-contour-color` | `:root`                        | Pref `contourColor`             | `#4f8ff7`                              |
| `--bookgroup-group-color`   | einzelne Zeile                 | `GroupColors` im Modus `random` | – (fällt auf die festen Farben zurück) |
| `--bookgroup-tint`          | Zeile (intern im CSS)          | 22 % der jeweiligen Farbe       | –                                      |

`--bookgroup-group-color` hat Vorrang vor den festen Farben. Die Kontur ist in beiden Ansichten 3 px breit; dieser Wert ist fest im CSS und nicht konfigurierbar.

---

## Preferences

Alle Schlüssel liegen unter `extensions.zotero.bookgroup.` (Defaults in `addon/prefs.js`). Werte, die im Einstellungsbereich geändert werden, wirken sofort.

| Schlüssel                                      | Typ    | Default     | Werte / Beschreibung                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions.zotero.bookgroup.enable`           | bool   | `true`      | Plugin-Funktion insgesamt. `false` sortiert gruppierte Listen nach Titel und entfernt alle Markierungen.                                                                                                                                                                                 |
| `extensions.zotero.bookgroup.citationDialog`   | bool   | `true`      | Gruppierung in „Zitation hinzufügen/bearbeiten“ und „Literaturverzeichnis bearbeiten“.                                                                                                                                                                                                   |
| `extensions.zotero.bookgroup.baseSort`         | string | `"creator"` | `"creator"` = Autor, Jahr, Titel; `"title"` = Titel, Autor, Jahr. Bestimmt die Reihenfolge der Gruppen.                                                                                                                                                                                  |
| `extensions.zotero.bookgroup.indent`           | int    | `16`        | Einrückung in px, 0–64 (Schieberegler in 2er-Schritten).                                                                                                                                                                                                                                 |
| `extensions.zotero.bookgroup.bgEnabled`        | bool   | `true`      | Hintergrundfarbe für Sammelwerke.                                                                                                                                                                                                                                                        |
| `extensions.zotero.bookgroup.bgColor`          | string | `"#4f8ff7"` | Feste Hintergrundfarbe (`#rrggbb`).                                                                                                                                                                                                                                                      |
| `extensions.zotero.bookgroup.contourEnabled`   | bool   | `true`      | Konturlinie entlang jeder Gruppe.                                                                                                                                                                                                                                                        |
| `extensions.zotero.bookgroup.contourColor`     | string | `"#4f8ff7"` | Feste Konturfarbe (`#rrggbb`).                                                                                                                                                                                                                                                           |
| `extensions.zotero.bookgroup.colorMode`        | string | `"fixed"`   | `"fixed"` = feste Farben oben; `"random"` = zufällige, persistente Farbe je Sammelwerk (für Hintergrund und Kontur).                                                                                                                                                                     |
| `extensions.zotero.bookgroup.groupColors`      | string | `"{}"`      | Intern. JSON-Objekt `{"<libraryID>/<itemKey>": "#rrggbb"}` für den Modus `random`.                                                                                                                                                                                                       |
| `extensions.zotero.bookgroup.restoreGroupSort` | bool   | `false`     | Intern, nicht beobachtet, nicht im Einstellungsbereich. `onShutdown` merkt sich hier, ob die Hauptliste gruppiert war. `onStartup` setzt den Wert auf `false` zurück und stellt die Gruppierung wieder her; gelingt das nicht sofort, bleibt `BookGroupServices.pendingRestore` gesetzt. |

Zusätzlich beobachtet das Plugin Zoteros eigene Pref `extensions.zotero.sortCreatorAsString`, weil der Ersteller-Sortierschlüssel davon abhängt.

### Beispiel

```js
// Gruppen nach Titel ordnen, Einrückung 32 px, Zufallsfarben
Zotero.Prefs.set("extensions.zotero.bookgroup.baseSort", "title", true);
Zotero.Prefs.set("extensions.zotero.bookgroup.indent", 32, true);
Zotero.Prefs.set("extensions.zotero.bookgroup.colorMode", "random", true);
```

Das dritte Argument `true` bedeutet, dass der Schlüssel vollständig (global) angegeben ist.

---

## Lifecycle-Hooks

`src/hooks.ts`, aufgerufen von `addon/bootstrap.js`. `bootstrap.js` lädt das Skript mit `loadSubScriptWithOptions(…, { target: ctx, ignoreCache: true })`.

| Hook                       | Aufgerufen                                                       | Aufgabe                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onStartup()`              | `startup()` in `bootstrap.js`                                    | Dienste erzeugen, Spalte, Observer (`bookgroup-items` 39, `bookgroup-view` 60, `sortCreatorAsString`), Relations laden, Fenster und Dialoge anbinden, `restoreGroupSort` auswerten |
| `onMainWindowLoad(win)`    | Öffnen eines Hauptfensters                                       | Stylesheet, Patches, Menü, Neusortierung                                                                                                                                           |
| `onMainWindowUnload(win)`  | Schließen eines Hauptfensters                                    | Gruppenfarben speichern, Menü, Patches und Stylesheet entfernen                                                                                                                    |
| `onShutdown()`             | Deaktivieren, Aktualisieren, Deinstallieren (nicht beim Beenden) | Gruppierung lösen, Zustand in `restoreGroupSort` merken, alle Observer abmelden, `trees.destroy()`, `relations.destroy()`                                                          |
| `onPrefsEvent(type, data)` | `onload` des Preference-Panes mit `type = "load"`                | `initPreferencePane()`; der Reset-Button setzt Farben zurück und rendert neu                                                                                                       |

Der Observer `bookgroup-view` reagiert auf die Notifier-Typen `item`, `collection-item` und `itemtree`:

- `collection-item`, `itemtree` sowie `item` mit `delete`, `trash` oder `remove` → `trees.scheduleResort()`.
- `itemtree`, solange `pendingRestore` gesetzt ist → erneuter Versuch, die Gruppierung des Hauptbaums wiederherzustellen.

Die Integrationstests warten mit `waitForPlugin: () => Zotero.BookGroup.data.initialized` auf den Start.
