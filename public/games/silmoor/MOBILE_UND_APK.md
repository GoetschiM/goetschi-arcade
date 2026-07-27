# Auf Server hosten · auf dem Handy spielen · APK erzeugen

Das Spiel ist jetzt eine **PWA** (installierbare Web-App) mit Offline-Cache.

## 1) Auf einen Server legen
Kopiere den kompletten Ordner-Inhalt (`index.html`, `game.js`, `manifest.webmanifest`,
`sw.js`, `icons/`, `assets/`) in das Web-Verzeichnis eines beliebigen Webservers
(nginx, Apache, ein statischer Container, GitHub Pages, Netlify …).

**Wichtig:** über **HTTPS** ausliefern (oder `http://localhost`). Der Service Worker
und „App installieren" funktionieren nur über HTTPS oder localhost.

Beispiel mit einem kleinen Container (nginx):
```
docker run -d --name silmoor -p 8080:80 \
  -v /pfad/zu/Silmoor-Game:/usr/share/nginx/html:ro nginx
```
Danach im Browser `http(s)://<server>:8080/` öffnen.

## 2) Auf dem Handy spielen / als App installieren
1. Auf dem Handy die gehostete URL im Browser öffnen (Chrome/Android oder Safari/iOS).
2. **Android/Chrome:** Menü (⋮) → „App installieren" bzw. „Zum Startbildschirm hinzufügen".
   **iOS/Safari:** Teilen-Symbol → „Zum Home-Bildschirm".
3. Das Spiel startet dann im Vollbild wie eine App (Touch-Tasten unten), quer,
   und läuft dank Cache auch offline.

## 3) Echte APK erzeugen (ohne eigene Build-Umgebung)
Eine echte `.apk` muss kompiliert werden (Android SDK). Am einfachsten wandelt man die
gehostete PWA um:

**Weg A – PWABuilder (empfohlen, kostenlos, kein Toolchain nötig):**
1. Spiel muss über **HTTPS** öffentlich erreichbar sein (Schritt 1).
2. Auf https://www.pwabuilder.com die URL eingeben → „Package for stores" → **Android**.
3. Paket herunterladen (signierte APK/AAB) und auf dem Handy installieren
   (bei „unbekannte Quellen" die Installation erlauben) oder in den Play Store laden.

**Weg B – selbst bauen (falls Android Studio vorhanden):**
- Mit **Capacitor** oder **Bubblewrap** (Trusted Web Activity) die PWA einpacken.
  Beides braucht JDK + Android SDK. Grobe Schritte mit Bubblewrap:
  ```
  npm i -g @bubblewrap/cli
  bubblewrap init --manifest https://<server>/manifest.webmanifest
  bubblewrap build
  ```

## Hinweis
Ich (Claude) konnte die APK hier nicht direkt kompilieren, weil in dieser Umgebung
keine Android-Build-Kette (JDK/Android SDK) verfügbar ist. Die PWA + PWABuilder ist
der zuverlässige Weg zu einer installierbaren APK.
