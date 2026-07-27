# Gemalte Grafik einsetzen (assets/)

Das Spiel läuft **sofort** mit der eingebauten Code-Grafik. Sobald du eine
passende PNG-Datei in den richtigen Ordner legst, benutzt das Spiel automatisch
dein Bild statt der gezeichneten Version. Fehlt eine Datei, bleibt die
Code-Grafik – du kannst also Stück für Stück ersetzen.

**Wichtig für alle Figuren-Sprites:**
- Transparenter Hintergrund (echtes PNG mit Alpha).
- Figur schaut nach **rechts** (das Spiel spiegelt automatisch nach links).
- Figur steht **unten mittig** im Bild (Füße an der Unterkante, horizontal zentriert).
- Größe ist egal, das Spiel skaliert – die genannten Maße sind Richtwerte.

## Benötigte Dateien

### Hintergrund (assets/bg/) – 3 Parallax-Ebenen
Breite Bilder, die sich **nahtlos links↔rechts kacheln** lassen (Höhe = 540 px, Breite z. B. 1920 px).

| Datei | Rolle | Hinweis |
|---|---|---|
| `assets/bg/cave_far.png`  | ferne Höhlenwand | darf deckend sein |
| `assets/bg/cave_mid.png`  | mittlere Ebene (Pilze, Bögen) | **transparente** Bereiche, damit „far" durchscheint |
| `assets/bg/cave_near.png` | vorderste Ebene (Blätter, Ranken) | **transparent**, dunkler |

### Held (assets/hero/) – ~128×160 px, transparent
| Datei | Zustand |
|---|---|
| `assets/hero/idle.png`   | stehen (Pflicht, sonst kein Sprite-Modus für den Helden) |
| `assets/hero/run.png`    | laufen (optional) |
| `assets/hero/jump.png`   | springen/fallen (optional) |
| `assets/hero/attack.png` | Nagel-Schlag (optional) |

### Gegner (assets/enemies/) – ~96×96 px, transparent
| Datei | Gegner |
|---|---|
| `assets/enemies/crawler.png` | Kriecher (läuft am Boden) |
| `assets/enemies/flyer.png`   | Flieger |
| `assets/enemies/hopper.png`  | Springer |
| `assets/enemies/spitter.png` | Spucker (schießt Projektile) |

### Boss (assets/boss/) – ~256×300 px, transparent
| Datei | |
|---|---|
| `assets/boss/hueter.png` | „Der Hüter" |

## Woher die gemalten Bilder?
Ich kann sie hier nicht selbst erzeugen. Erstellen kannst du sie z. B. mit einem
Bild-KI-Tool (Prompt in Richtung „Hollow-Knight-style, painted, dark teal cavern,
transparent background, side view, facing right") und dann als PNG mit
transparentem Hintergrund exportieren – oder von einer Künstlerin zeichnen lassen
bzw. aus einem Asset-Pack nehmen, an dem du die Rechte hast. Danach einfach in den
jeweiligen Ordner legen und die Seite neu laden.
