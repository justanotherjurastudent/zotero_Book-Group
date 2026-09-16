# Benutzerhandbuch

**Book Group** ordnet in Zotero Buchteile und Enzyklopädieartikel direkt unter dem Buch an, zu dem sie gehören (im Folgenden „Sammelwerk“). Beiträge werden eingerückt, Sammelwerke farbig hinterlegt und jede Gruppe mit einer farbigen Linie markiert. Das funktioniert in der Eintragsliste von Zotero und in den Zitationsdialogen für Word und LibreOffice.

Nach diesem Handbuch haben Sie das Plugin installiert, Ihre ersten Beiträge mit einem Sammelwerk verknüpft und die Gruppierung eingeschaltet.

## Inhalt

- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Buch und Buchteil verknüpfen](#buch-und-buchteil-verknüpfen)
- [Gruppierung einschalten](#gruppierung-einschalten)
- [Was Sie sehen](#was-sie-sehen)
- [Einstellungen](#einstellungen)
- [Zitationsdialoge](#zitationsdialoge)
- [Grenzen](#grenzen)
- [Fehlerbehebung](#fehlerbehebung)

## Voraussetzungen

- **Zotero 10** (jede Version 10.x). Ältere und neuere Hauptversionen werden nicht unterstützt.
- Zum Selbstbauen zusätzlich: [Node.js](https://nodejs.org/) mit npm.

## Installation

### Aus einem Release

1. Laden Sie die Datei `book-group.xpi` aus den Releases des Repositorys herunter: <https://github.com/justanotherjurastudent/zotero_Book-Group/releases>
2. Öffnen Sie in Zotero **Werkzeuge → Plugins** (_Tools → Plugins_).
3. Klicken Sie auf das Zahnrad-Symbol und wählen Sie **Plugin aus Datei installieren…** (_Install Plugin From File…_).
4. Wählen Sie die heruntergeladene `.xpi`-Datei aus.

Ein Neustart von Zotero ist nicht erforderlich.

### Selbst bauen

```bash
git clone https://github.com/justanotherjurastudent/zotero_Book-Group.git
cd zotero_Book-Group
npm install
npm run build
```

Das Ergebnis liegt unter `.scaffold/build/book-group.xpi`. Installieren Sie diese Datei wie oben beschrieben.

## Buch und Buchteil verknüpfen

Book Group erkennt die Zugehörigkeit **ausschließlich** über Zoteros Funktion „Verwandt“ (_Related_). Das Plugin speichert selbst keine Zuordnung.

**Neuen Buchteil anlegen:** Klicken Sie mit der rechten Maustaste auf ein Buch und wählen Sie **Buchteil erstellen** (_Create Book Section_). Zotero legt die Verknüpfung dabei automatisch an.

**Vorhandene Einträge verknüpfen:**

1. Wählen Sie das Buch (Eintragstyp „Buch“) aus.
2. Klicken Sie im rechten Bereich im Abschnitt **Verwandt** auf **+**.
3. Wählen Sie den Buchteil (Eintragstyp „Buchteil“) oder Enzyklopädieartikel aus und bestätigen Sie.

Es spielt keine Rolle, ob Sie die Verknüpfung beim Buch oder beim Buchteil anlegen.

Die Liste aktualisiert sich nach etwa einer Drittelsekunde von selbst.

## Gruppierung einschalten

Die Gruppierung ist eine besondere **Sortierung** der Eintragsliste. Sie ist aktiv, solange die Liste nach der Spalte „Sammelwerk“ sortiert ist. Sie haben drei Wege:

### Über das Menü

**Ansicht → Sortieren nach → Nach Sammelwerk gruppieren** (_View → Sort By → Group by Edited Volume_)

Der Eintrag hat ein Häkchen, solange die Gruppierung aktiv ist. Ein erneuter Klick schaltet sie aus; die Liste wird dann nach Titel sortiert.

### Über das Kontextmenü der Spaltenüberschrift

1. Klicken Sie mit der rechten Maustaste auf eine beliebige Spaltenüberschrift der Eintragsliste.
2. Wählen Sie **Nach Sammelwerk gruppieren** (_Group by Edited Volume_). Der Eintrag steht direkt über dem Untermenü für die sekundäre Sortierung.

Auch hier zeigt ein Häkchen an, dass die Gruppierung aktiv ist; ein erneuter Klick schaltet sie aus. Das Kontextmenü funktioniert ebenso in den Dialogen des Word- und LibreOffice-Plugins (siehe [Zitationsdialoge](#zitationsdialoge)).

### Über die Spalte „Sammelwerk“

1. Klicken Sie mit der rechten Maustaste auf einen Spaltenkopf der Eintragsliste.
2. Wählen Sie **Weitere Spalten → Sammelwerk** (_More Columns → Edited Volume_).
3. Klicken Sie auf den Spaltenkopf **Sammelwerk**.

Die Spalte zeigt bei Beiträgen den Titel des Sammelwerks und die Seiten (z. B. `Handbuch des Verwaltungsrechts › S. 101-120`), bei Sammelwerken den eigenen Titel. Ein weiterer Klick auf den Spaltenkopf kehrt die Sortierrichtung um.

### Gruppierung beenden

Klicken Sie auf einen **anderen** Spaltenkopf (z. B. „Titel“ oder „Datum“) oder entfernen Sie das Häkchen im Menü bzw. im Kontextmenü der Spaltenüberschrift. Die Einträge erscheinen dann wieder in normaler Reihenfolge ohne Markierungen.

> **Hinweis:** Wenn Sie das Plugin in den Einstellungen ausschalten und wieder einschalten, wird die Hauptliste sofort gruppiert. Auch nach einem Plugin-Update oder nach Deaktivieren und erneutem Aktivieren unter **Werkzeuge → Plugins** stellt Book Group eine vorher aktive Gruppierung wieder her. Ist die Spalte „Sammelwerk“ in diesem Moment noch nicht bereit, holt das Plugin die Wiederherstellung nach, sobald Zotero die Eintragsliste neu aufbaut.

## Was Sie sehen

In gruppierter Ansicht gilt:

- **Reihenfolge der Gruppen:** Sammelwerke und alle nicht gruppierten Einträge werden gemeinsam nach Autor, Jahr und Titel sortiert (einstellbar: Titel, Autor, Jahr). Leere Angaben stehen hinten. Eigenständige Notizen und Anhänge werden genauso einsortiert und bilden jeweils eine eigene „Gruppe“.
- **Innerhalb einer Gruppe:** Zuerst das Sammelwerk, darunter seine Beiträge nach der ersten Seite im Feld „Seiten“ (Details unter [Die Reihenfolge innerhalb einer Gruppe stimmt nicht](#die-reihenfolge-innerhalb-einer-gruppe-stimmt-nicht)). Römische Seitenzahlen (Vorwort, z. B. `xii–xv`) stehen vor arabischen. Beiträge ohne Seitenangabe folgen am Ende, nach Titel sortiert.
- **Absteigend sortiert:** Die Gruppen erscheinen in umgekehrter Reihenfolge. Innerhalb einer Gruppe bleibt das Sammelwerk oben und die Beiträge bleiben nach Seiten aufsteigend.
- **Änderungen:** Ändern Sie Titel, Autor oder Datum eines Sammelwerks, wandert die ganze Gruppe an die neue Position. Werden Einträge in eine Sammlung aufgenommen, aus ihr entfernt oder gelöscht, wird die Liste ebenfalls neu gruppiert.
- **Papierkorb:** Gelöschte Sammlungen und gespeicherte Suchen stehen in aufsteigender Sortierung vor allen Einträgen, in absteigender dahinter.
- **Einrückung:** Beiträge sind in der ersten Spalte eingerückt, ebenso ihre Anhänge und Notizen.
- **Hintergrund:** Das Sammelwerk ist leicht eingefärbt. Zoteros Zeilenstreifen und die Auswahlfarbe bleiben erhalten; ausgewählte Zeilen werden nicht eingefärbt.
- **Kontur:** Eine 3 Pixel breite farbige Linie am linken Rand markiert alle Zeilen der Gruppe: Sammelwerk, seine Anhänge und Notizen sowie alle Beiträge samt deren Anhängen und Notizen.

Ein Sammelwerk wird nur markiert, wenn mindestens einer seiner Beiträge in der Liste steht.

## Einstellungen

Öffnen Sie **Bearbeiten → Einstellungen** (unter macOS **Zotero → Einstellungen**) und wählen Sie links **Book Group**. Alle Änderungen wirken sofort.

| Einstellung                                                                                                                                  | Standard                         | Wirkung                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beiträge unter ihrem Sammelwerk gruppieren**                                                                                               | an                               | Hauptschalter. Aus: Gruppierte Listen werden nach Titel sortiert, alle Markierungen verschwinden und der Menüeintrag wird ausgeblendet. An: Die Hauptliste (und bei aktivierter Dialog-Option die Dialoglisten) werden sofort gruppiert. |
| **Auch in den Dialogen „Zitation hinzufügen/bearbeiten“ und „Literaturverzeichnis bearbeiten“ des Word- und LibreOffice-Plugins gruppieren** | an                               | Siehe [Zitationsdialoge](#zitationsdialoge).                                                                                                                                                                                             |
| **Sammelwerke sortieren nach**                                                                                                               | Autor, Jahr, Titel               | Reihenfolge der Gruppen: „Autor, Jahr, Titel“ oder „Titel, Autor, Jahr“.                                                                                                                                                                 |
| **Einrückung**                                                                                                                               | 16 px                            | Schieberegler von 0 bis 64 px in 2er-Schritten.                                                                                                                                                                                          |
| **Hintergrundfarbe für Sammelwerke**                                                                                                         | an, Blau                         | Kontrollkästchen und Farbfeld (siehe [Farbe auswählen](#farbe-auswählen)).                                                                                                                                                               |
| **Konturlinie entlang jeder Gruppe**                                                                                                         | an, Blau                         | Kontrollkästchen und Farbfeld (siehe [Farbe auswählen](#farbe-auswählen)).                                                                                                                                                               |
| **Farben**                                                                                                                                   | „Oben gewählte Farben verwenden“ | „Zufällige Farbe je Sammelwerk (bleibt nach Neustart erhalten)“: Jedes Sammelwerk erhält eine eigene Farbe für Hintergrund und Kontur. Die Farbfelder oben sind dann gesperrt.                                                           |
| **Neue Zufallsfarben vergeben**                                                                                                              | –                                | Nur im Zufallsmodus aktiv. Verwirft alle gespeicherten Farben; jedes Sammelwerk bekommt eine neue.                                                                                                                                       |

### Farbe auswählen

Neben „Hintergrundfarbe für Sammelwerke“ und „Konturlinie entlang jeder Gruppe“ steht jeweils ein quadratisches Farbfeld mit der aktuellen Farbe. Ein Klick darauf öffnet eine Auswahl mit zehn vordefinierten Farben: Blau, Himmelblau, Petrol, Grün, Gelb, Orange, Rot, Weinrot, Violett und Grau. Die gewählte Farbe wird sofort übernommen. Mit der Tastatur öffnen Sie die Auswahl mit Leertaste, Eingabetaste oder Pfeil nach unten und wählen mit den Pfeiltasten.

Die Farbfelder sind gesperrt, solange das zugehörige Kontrollkästchen aus ist oder der Zufallsmodus gilt.

Zufallsfarben werden je Sammelwerk dauerhaft gespeichert. Wird ein Sammelwerk endgültig gelöscht, wird auch seine Farbe entfernt.

## Zitationsdialoge

Mit der Einstellung **Auch in den Dialogen … gruppieren** (Standard: an) gruppiert Book Group auch in den Dialogen, die das Zotero-Plugin für Word oder LibreOffice öffnet.

### „Zitation hinzufügen/bearbeiten“

- **Bibliotheksansicht:** Die Eintragsliste wird beim Öffnen des Dialogs automatisch nach „Sammelwerk“ gruppiert. Alles Weitere funktioniert wie im Hauptfenster: Ein Rechtsklick auf eine Spaltenüberschrift bietet **Nach Sammelwerk gruppieren** an, und ein Klick auf eine andere Spalte beendet die Gruppierung.
- **Listenansicht:** Die Suchergebnisse werden **pro Abschnitt** gruppiert. Ein Beitrag wird nur dann unter sein Sammelwerk gesetzt und eingerückt, wenn das Sammelwerk im selben Abschnitt steht. Die Tastaturnavigation folgt der neuen Reihenfolge. Die Vorauswahl des ersten Ergebnisses und der Tastaturfokus gehen dabei nicht verloren: Rückt durch die Gruppierung ein anderer Eintrag an die erste Stelle, wird dieser vorausgewählt.
- Im eingeklappten Stapel der ausgewählten Einträge („Ausgewählt“) wird nicht gruppiert.

Das Einfügen von Zitationen selbst wird nicht verändert.

### „Literaturverzeichnis bearbeiten“

Die Eintragsliste des Dialogs wird beim Öffnen automatisch gruppiert. Über das Kontextmenü der Spaltenüberschrift lässt sich die Gruppierung aus- und wieder einschalten.

Andere Dialoge zum Auswählen von Einträgen werden nicht gruppiert, auch wenn sie intern dieselbe Eintragsliste verwenden. Die Spalte „Sammelwerk“ ist dort im Spaltenwähler zwar verfügbar, ein Klick darauf gruppiert aber nicht.

### Abschalten

Entfernen Sie das Häkchen bei **Auch in den Dialogen … gruppieren**. Offene Dialoge werden sofort nach Titel sortiert, Markierungen verschwinden. Die Gruppierung im Hauptfenster bleibt davon unberührt.

## Grenzen

- **Nur direkte Relationen zwischen bestimmten Typen.** Gruppiert werden nur Buch ↔ Buchteil und Buch ↔ Enzyklopädieartikel. Zotero kennt keinen eigenen Eintragstyp für Enzyklopädien; erfassen Sie eine Enzyklopädie daher als **Buch** und verknüpfen Sie die Artikel damit. Verknüpfungen Buch ↔ Buch, Buchteil ↔ Buchteil oder mit anderen Typen (z. B. Zeitschriftenartikel) werden ignoriert, ebenso indirekte Ketten.
- **Ein Beitrag, mehrere Bücher.** Ist ein Beitrag mit mehreren Büchern verknüpft, wählt Book Group das Buch, dessen **Titel dem Buchtitel des Beitrags entspricht** und das **mindestens einen Herausgeber mit dem Beitrag gemeinsam** hat. Genau diese Angaben übernimmt Zotero, wenn Sie über „Buchteil erstellen“ einen Buchteil aus einem Buch anlegen. Groß-/Kleinschreibung und zusätzliche Leerzeichen spielen beim Vergleich keine Rolle. Passt keines der Bücher (oder passen mehrere), wird das Buch mit der kleinsten internen ID gewählt; das ist in der Regel das zuerst angelegte.
- **Nur sichtbare Sammelwerke.** Ein Beitrag wird nur eingerückt, wenn sein Sammelwerk in derselben Ansicht sichtbar ist. Das betrifft z. B. eine Sammlung, eine gespeicherte Suche oder einen Suchfilter, der das Buch nicht enthält. Andernfalls wird der Beitrag wie ein normaler Eintrag einsortiert.
- **Gleiche Bibliothek.** Verknüpfungen zwischen Einträgen verschiedener Bibliotheken (z. B. „Meine Bibliothek“ und eine Gruppenbibliothek) werden ignoriert.
- **Papierkorb.** Einträge im Papierkorb nehmen nicht an der Gruppierung teil.
- **Eingeklappter „Ausgewählt“-Stapel** im Zitationsdialog: keine Gruppierung.
- **Wo gruppiert wird:** in der Eintragsliste des Hauptfensters und in den beiden oben genannten Dialogen, nicht in anderen Auswahldialogen.

## Fehlerbehebung

### Das Plugin lässt sich nicht installieren oder erscheint nicht

- Prüfen Sie Ihre Zotero-Version unter **Hilfe → Über Zotero**. Book Group benötigt **Zotero 10.x**. In anderen Versionen lehnt Zotero die Installation ab oder deaktiviert das Plugin.
- Prüfen Sie unter **Werkzeuge → Plugins**, ob Book Group aktiviert ist.

### Der Menüeintrag „Nach Sammelwerk gruppieren“ fehlt

- Ist **Beiträge unter ihrem Sammelwerk gruppieren** in den Einstellungen eingeschaltet? Bei ausgeschaltetem Plugin wird der Eintrag ausgeblendet.
- Wenn die Einstellung an ist, konnte die Spalte nicht registriert werden. Prüfen Sie die Debug-Ausgabe (siehe unten).

### Beiträge werden nicht unter ihrem Buch angezeigt

Gehen Sie diese Punkte der Reihe nach durch:

1. **Ist die Liste nach „Sammelwerk“ sortiert?** Im Menü **Ansicht → Sortieren nach** muss „Nach Sammelwerk gruppieren“ ein Häkchen haben.
2. **Sind die Einträge verknüpft?** Das Buch muss im Abschnitt „Verwandt“ des Beitrags stehen (oder umgekehrt).
3. **Stimmen die Eintragstypen?** Das Sammelwerk muss „Buch“ sein, der Beitrag „Buchteil“ oder „Enzyklopädieartikel“.
4. **Ist der Beitrag mit mehreren Büchern verknüpft?** Dann entscheiden Buchtitel und Herausgeber (siehe [Grenzen](#grenzen)). Gleichen Sie die Felder „Buchtitel“ und „Herausgeber“ des Beitrags mit dem gewünschten Buch ab.
5. **Ist das Buch in der aktuellen Ansicht sichtbar?** Wechseln Sie testweise zu „Meine Bibliothek“ und leeren Sie das Suchfeld.
6. **Liegen beide in derselben Bibliothek?**

### Die Reihenfolge innerhalb einer Gruppe stimmt nicht

Die Beiträge werden nach der ersten Seite im Feld **Seiten** geordnet. Beiträge ohne Seiten stehen am Ende der Gruppe. So liest Book Group das Feld:

| Feldinhalt          | Erste Seite                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| `101-120`           | 101                                                                           |
| `S. 101–120`        | 101                                                                           |
| `Bd. 2, S. 45-60`   | 45 (die Angabe nach `S.`, `p.`, `pp.`, `Seite(n)` oder `page(s)` hat Vorrang) |
| `vol. 3, pp. 17–30` | 17                                                                            |
| `xii–xv`            | römisch, steht vor Seite 1                                                    |
| `c. 12`             | 12 (einzelne Buchstaben gelten nur bei `i`, `v` und `x` als römische Zahl)    |
| `passim`            | keine Seite                                                                   |

Steht die Seitenangabe hinter anderen Zahlen (etwa einer Bandnummer), setzen Sie `S.` davor.

### Debug-Ausgabe erstellen

1. **Hilfe → Debug-Ausgabe protokollieren → Aktivieren** (_Help → Debug Output Logging → Enable_).
2. Führen Sie den Schritt aus, der nicht funktioniert (z. B. Zotero-Fenster schließen und neu öffnen, Plugin unter **Werkzeuge → Plugins** aus- und wieder einschalten).
3. **Hilfe → Debug-Ausgabe protokollieren → Ausgabe anzeigen** (_View Output_).
4. Suchen Sie nach `[Book Group]`.

Aufschlussreiche Meldungen:

| Meldung                                                                      | Bedeutung                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Relation cache: N links in X ms`                                            | Der Index wurde aufgebaut; `N` ist die Zahl der zugeordneten Beiträge. `0` bedeutet: keine passende Verknüpfung gefunden. |
| `sort column could not be registered`                                        | Die Spalte „Sammelwerk“ konnte nicht angelegt werden; die Gruppierung ist nicht verfügbar.                                |
| `item tree internals not found – grouping disabled in this window`           | Die Zotero-Version weicht intern von der unterstützten ab. In diesem Fenster wird nicht gruppiert.                        |
| `patch of _renderItem did not take effect` (ebenso `_compareField`, `_sort`) | Wie oben: Das Plugin konnte sich nicht in die Eintragsliste einklinken.                                                   |
| `Could not activate grouping in tree …`                                      | Ein Dialog konnte nicht automatisch gruppiert werden.                                                                     |

Ausnahmen, die das Plugin abfängt, werden zusätzlich mit `Zotero.logError` in die Fehlerkonsole geschrieben (**Werkzeuge → Entwickler → Fehlerkonsole**).

Wenn Sie ein Problem melden, fügen Sie die Debug-Ausgabe und Ihre Zotero-Version an: <https://github.com/justanotherjurastudent/zotero_Book-Group/issues>

### Nach einem Update wirkt noch die alte Version

Das Hauptskript des Plugins wird immer unter Umgehung von Zoteros Start-Cache geladen. Sehen Einstellungsbereich oder Darstellung trotzdem noch nach der alten Version aus, starten Sie Zotero einmal mit dem Parameter `-purgecaches`:

- **Windows:** `"C:\Program Files\Zotero\zotero.exe" -purgecaches` (Pfad ggf. anpassen)
- **macOS:** `/Applications/Zotero.app/Contents/MacOS/zotero -purgecaches`
- **Linux:** `zotero -purgecaches` im Installationsverzeichnis von Zotero

### Die Zufallsfarben gefallen mir nicht

Klicken Sie in den Einstellungen auf **Neue Zufallsfarben vergeben**. Der Button ist nur im Modus „Zufällige Farbe je Sammelwerk“ aktiv.
