# kleinanzeigen-filter
Schließt Anzeigen, die bestimmte Begriffe beinhalten aus der Liste der angezeigten Suchergebnisse aus


# Kleinanzeigen Ausschlussfilter

Userscript, das in der Suchergebnisliste von kleinanzeigen.de Anzeigen ausblendet, die bestimmte Begriffe enthalten (Titel und optional Beschreibung).

- läuft komplett lokal im Browser, kein Server, kein Scraping, keine Datenübertragung
- Begriffe werden dauerhaft gespeichert
- filtert auch nachgeladene oder gewechselte Ergebnisse automatisch
- Begriffe: Teilstring (`defekt`), Platzhalter (`ersatz*teil`) oder Regex (`/\bbastler\b/i`)

## Auf GitHub betreiben

1. Neues öffentliches Repository `kleinanzeigen-filter` anlegen und diese drei Dateien hochladen (Branch `main`).
2. In `kleinanzeigen-filter.user.js` alle Vorkommen von `DEIN-USER` durch deinen GitHub-Namen ersetzen.
3. **Settings → Pages → Source: Deploy from branch → `main` / root** aktivieren.
4. Die Seite `https://DEIN-USER.github.io/kleinanzeigen-filter/` ist nun deine Installationsseite.
   Alternativ direkt installieren über die Raw-URL:
   `https://raw.githubusercontent.com/DEIN-USER/kleinanzeigen-filter/main/kleinanzeigen-filter.user.js`

Updates: Datei ändern, `@version` erhöhen und committen. Tampermonkey aktualisiert automatisch über `@updateURL`.

## Nutzung

Nach der Installation erscheint auf Suchergebnisseiten unten rechts das Feld „Ausschlussfilter“. Begriff eingeben, Enter drücken, fertig. Mehrere Begriffe mit Komma trennen.

## Hinweise

- Mobil funktioniert es z. B. mit Firefox für Android + Tampermonkey/Violentmonkey.
- Falls Kleinanzeigen sein HTML ändert, müssen ggf. die Selektoren (`AD_SELECTOR` und die Titel-/Beschreibungs-Selektoren in `adText`) im Script angepasst werden.
