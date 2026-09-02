# Silmoor — lokales Spielprojekt

Ein Hollow-Knight-inspirierter 2D-Action-Platformer (Nahkampf, vier Gegnertypen,
Endboss, Checkpoints, Touch-Steuerung). Läuft komplett lokal, ohne Internet.

## Starten

**Einfachster Weg (Windows):** Doppelklick auf `serve.bat`.
Es startet einen kleinen lokalen Webserver und öffnet das Spiel im Browser
(`http://localhost:8777/index.html`).

**Manuell:** In diesem Ordner ein Terminal öffnen und ausführen:

```bash
python -m http.server 8777
```

Dann im Browser `http://localhost:8777/index.html` aufrufen.

> Warum ein Server und nicht einfach die `index.html` doppelklicken? Beim direkten
> Öffnen (`file://`) blockieren manche Browser das Laden der PNG-Bilder auf die
> Leinwand. Über den lokalen Server funktioniert alles zuverlässig.

## Steuerung

| Aktion | Tastatur | Touch |
|---|---|---|
| Bewegen / zielen / klettern | Pfeile / W A S D | analoger Bewegungsstick |
| Springen | Leertaste | SPRUNG |
| Nagel-Schlag | J / X | NAGEL |
| Pogo | ▼ + Nagel in der Luft (auf Gegner/Dornen) | Stick nach unten + NAGEL |
| Level neu | R | — |

## Runenblock-Rätsel

Die schweren leuchtenden Blöcke lassen sich von der Seite schieben. Treffen sie
auf ein Dornenfeld, drücken sie es dauerhaft in den Boden. Schiebe den Block
anschließend auf das leuchtende Bodensiegel, damit das zugehörige Tor offen
bleibt.

## Eigene gemalte Grafik einsetzen

Siehe **ASSETS.md**. Kurz: passende PNGs in die `assets/`-Unterordner legen –
das Spiel benutzt sie automatisch, sonst die eingebaute Code-Grafik.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Seite, Steuerung, Layout |
| `game.js` | die komplette Spiel-Logik (Physik, Kampf, Gegner, Boss, Render) |
| `assets/` | hier kommen deine gemalten PNGs rein (siehe ASSETS.md) |
| `serve.bat` | startet lokalen Server + Browser |

## Stand / offen
- Läuft mit Code-Grafik als Fallback; gemalte PNGs sind der nächste Schritt.
- Sprites werden aktuell **statisch** eingeblendet (ein Bild pro Zustand), noch
  keine Frame-Animation – das lässt sich später ergänzen.
- Balance (Boss-Schwierigkeit, Gegner) ist noch nicht feingetunt.
