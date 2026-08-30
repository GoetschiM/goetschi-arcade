---
name: goetschi-arcade-deploy
description: Use when adding, updating, or deploying a browser game to Goetschi Arcade — the static game hub at GoetschiM/goetschi-arcade, live on Coolify (CT118). Triggers on "Goetschi Arcade", "Game Arcade", "Goetschi Labs Arcade", or any request to add/deploy a new browser game for Michel.
---

# Goetschi Arcade — adding and deploying a game

Goetschi Arcade is a static nginx hub (`GoetschiM/goetschi-arcade` on GitHub) that
lists browser games as tiles on a home page and serves each game from its own
folder. It runs as a Coolify application on CT118.

- Live: <http://10.0.60.139:8099/> (LAN only) · <http://arcade.10.0.60.139.sslip.io/>
- Coolify project **Arcade**, app **arcade**, UUID `dc5fp7ny50bjtfv45lar3v0n`
- Coolify API base: `http://10.0.60.139:8000`

## Repo layout

```
public/
  index.html      hub page — reads games.json and renders tiles
  games.json       list of all games (edit this to register a game)
  favicon.svg
  games/
    <slug>/         one folder per game, must contain its own index.html
```

## Adding a new game

1. Prefer a single self-contained `index.html` (inline CSS/JS, no external
   dependencies) when the game is simple — this sidesteps the relative-path
   requirement entirely. If the game does need extra files, all paths inside
   it **must be relative** (`game.js`, not `/game.js`), because it's served
   under `/games/<slug>/`, not `/`.
2. Copy the game folder to `public/games/<slug>/`.
3. Add an entry to `public/games.json`:
   ```json
   {
     "slug": "mein-spiel",
     "title": "Mein Spiel",
     "subtitle": "Untertitel",
     "description": "Ein bis zwei Sätze für die Kachel.",
     "cover": "games/mein-spiel/cover.png",
     "accent": "#c98f5e",
     "tags": ["Puzzle", "2 Spieler"],
     "controls": "Nur Tastatur",
     "added": "YYYY-MM-DD"
   }
   ```
   `slug` must match the folder name exactly. `cover`, `accent`, `subtitle`,
   `tags`, `controls` are optional — without a cover the tile shows a
   gradient with the game's initial letter.
4. Sanity-check locally before pushing: `python3 -m json.tool public/games.json`
   and `python3 -m http.server 8080 --directory public`, then check the hub
   (`/`) and the game (`/games/<slug>/`) both return 200. (Docker isn't always
   available in agent sandboxes — the plain http.server check is enough; you
   just won't see the injected "← Arcade" back-button, which only nginx adds.)

## Deploying

Requires push access to `GoetschiM/goetschi-arcade` (SSH deploy key or PAT —
ask the repo owner, don't post the credential in a public channel) and,
for automatic redeploy, a Coolify API token (`COOLIFY_TOKEN`).

- Preferred (from a machine with the token and PowerShell): `.\deploy.ps1 "message"`
  — commits, pushes, and triggers a Coolify rebuild, then polls until done.
- Manual: `git add -A && git commit -m "…" && git push`, then in Coolify
  (**Arcade → arcade**) click **Redeploy**.
- Manual API redeploy (any shell, once you have `COOLIFY_TOKEN`):
  ```bash
  curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
    "http://10.0.60.139:8000/api/v1/deploy?uuid=dc5fp7ny50bjtfv45lar3v0n&force=false"
  # poll http://10.0.60.139:8000/api/v1/deployments/<deployment_uuid> for status
  ```
- There's no webhook auto-deploy: Coolify only listens on the LAN, so GitHub
  can't reach it. A push alone does not go live — always follow up with a
  redeploy.

### No `COOLIFY_TOKEN`? Deploy straight through Docker instead

No Coolify token has ever been found stored anywhere (Notion included) as of
2026-08-30. You don't need one — Coolify is just orchestrating plain Docker
underneath, and you can do exactly what its "Redeploy" button does by hand
once you have root on CT118:

1. **Get to CT118.** SSH to the Proxmox host `pve01` (`10.0.60.10`) as root —
   password auth only, no key installed; ask Michel or check his Notion
   "Credentials & Zugänge" page for the current password if you don't have
   it. From pve01: `pct exec 118 -- bash -c '...'` runs commands inside the
   CT118 container non-interactively (no separate SSH hop into CT118 needed).
2. **Build the new image.** Inside CT118:
   ```bash
   git clone --depth 1 https://github.com/GoetschiM/goetschi-arcade.git /tmp/arcade-build
   cd /tmp/arcade-build
   git rev-parse HEAD   # full 40-char SHA — this becomes the image tag
   docker build -t dc5fp7ny50bjtfv45lar3v0n:<full-commit-sha> .
   ```
3. **Point the running app at the new image.** The app's compose file lives
   at `/data/coolify/applications/dc5fp7ny50bjtfv45lar3v0n/docker-compose.yaml`
   (container name `dc5fp7ny50bjtfv45lar3v0n-184955118641`). Back it up, then
   edit the `image:` line to the tag you just built:
   ```bash
   cd /data/coolify/applications/dc5fp7ny50bjtfv45lar3v0n
   cp docker-compose.yaml docker-compose.yaml.bak-$(date +%s)
   sed -i "s|image: '.*'|image: 'dc5fp7ny50bjtfv45lar3v0n:<full-commit-sha>'|" docker-compose.yaml
   docker compose up -d
   ```
4. **Clean up and verify:** `rm -rf /tmp/arcade-build`, then from anywhere
   with LAN access: `curl http://10.0.60.139:8099/games.json` should show
   the new game, and `curl -o /dev/null -w '%{http_code}' http://10.0.60.139:8099/games/<slug>/`
   should return 200.

This has been used successfully for three deploys in a row (2048, Void Dash,
Neon Swarm) — treat it as the primary path, not a fallback, until someone
actually finds/generates a working `COOLIFY_TOKEN`.

## Things the server does for you

- `nginx.conf` injects a small "← Arcade" back-button into every page under
  `/games/` via `sub_filter`, so game source stays untouched.
- `index.html`, `games.json`, and any `sw.js` are served with `no-store` so a
  new game or a new score appears immediately without a stale service worker
  or cached hub page.
- PWA install prompts only work over HTTPS (or localhost) — over the plain
  LAN http address the games still run fine, just without "add to home
  screen" / offline caching.
