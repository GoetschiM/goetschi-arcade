# Goetschi Arcade

Ein statischer Spiele-Hub: eine Startseite mit Kacheln, dahinter die einzelnen
Browserspiele. Läuft als nginx-Container in Coolify (CT118).

```
public/
  index.html      Hub — liest games.json und baut daraus die Kacheln
  games.json      Liste aller Spiele (das ist die Datei, die du pflegst)
  favicon.svg
  games/
    silmoor/      ein Spiel = ein Ordner mit eigener index.html
```

## Ein neues Spiel hinzufügen

1. Spielordner nach `public/games/<slug>/` kopieren — er muss eine `index.html`
   enthalten. Alle Pfade im Spiel müssen **relativ** sein (`game.js`, nicht `/game.js`),
   weil das Spiel unter `/games/<slug>/` läuft.
2. In `public/games.json` einen Eintrag ergänzen:

```json
{
  "slug": "mein-spiel",
  "title": "Mein Spiel",
  "subtitle": "Untertitel",
  "description": "Ein bis zwei Sätze, die auf der Kachel stehen.",
  "cover": "games/mein-spiel/cover.png",
  "accent": "#c98f5e",
  "tags": ["Puzzle", "2 Spieler"],
  "controls": "Nur Tastatur",
  "added": "2026-08-01"
}
```

`slug` muss dem Ordnernamen entsprechen. `cover`, `accent`, `subtitle`, `tags` und
`controls` sind optional — ohne Cover zeigt die Kachel einen Farbverlauf mit dem
Anfangsbuchstaben.

3. Committen und pushen:

```bash
git add -A && git commit -m "Spiel XY ergänzt" && git push
```

Coolify baut das Image neu und deployt automatisch (Auto-Deploy per Webhook).
Falls der Webhook mal nicht greift: in Coolify auf der App **Redeploy** klicken.

## Was der Server zusätzlich macht

`nginx.conf` blendet in jedes Spiel oben links eine dezente **„◄ Arcade"**-Schaltfläche
ein (per `sub_filter`). Der Spiel-Quellcode bleibt dadurch unangetastet — auch
zukünftige Spiele bekommen den Zurück-Weg automatisch.

Ausserdem werden `index.html`, `games.json` und alle `sw.js` mit `no-store`
ausgeliefert, damit neue Spielstände nach einem Deploy sofort sichtbar sind und
kein Service Worker eine alte Version festhält.

## Lokal testen

```bash
docker build -t arcade . && docker run --rm -p 8080:80 arcade
# http://localhost:8080
```

Ohne Docker reicht auch `python -m http.server 8080 --directory public` — dann fehlt
nur die eingeblendete Zurück-Schaltfläche.

## Hinweis zu PWA / „App installieren"

Die Spiele bringen Service Worker und Manifest mit. Damit ein Browser sie
installieren lässt, muss die Seite über **HTTPS** (oder localhost) laufen. Über die
LAN-Adresse per http funktionieren die Spiele normal, nur „zum Startbildschirm
hinzufügen" und der Offline-Cache bleiben aus.
