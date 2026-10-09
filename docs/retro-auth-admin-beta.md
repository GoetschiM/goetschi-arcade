# Goetschi Arcade – Retro Library / Authentik Beta

This branch converts the *whole Arcade* from public static nginx to authenticated nginx + a small Node.js session/catalog/ROM service. **Do not merge/redeploy without configuring Authentik and persistent storage.** On missing/invalid settings it fails closed with HTTP 503 rather than exposing games.

## Coolify configuration

Keep the existing single-container app, point the same hostname at port 80. Use **HTTPS** at Traefik; the prior LAN-only HTTP URL is intentionally not a production login endpoint. A plain HTTP URL is allowed for development **only on localhost**.

Add these server-only environment variables:

| Variable | Example | Required |
|---|---|---|
| \`ARCADE_PUBLIC_URL\` | \`https://arcade.example.ch/\` | yes; externally visible origin |
| \`AUTHENTIK_ISSUER\` | \`https://auth.example.ch/application/o/goetschi-arcade/\` | yes; exact OIDC issuer |
| \`AUTHENTIK_CLIENT_ID\` | App client ID | yes |
| \`AUTHENTIK_CLIENT_SECRET\` | App secret | yes, **Coolify secret** |
| \`ARCADE_USER_GROUPS\` | \`arcade-users,arcade-admins\` | optional; default shown |
| \`ARCADE_ADMIN_GROUPS\` | \`arcade-admins\` | optional; default shown |
| \`ARCADE_DATA_DIR\` | \`/data/arcade\` | recommended |
| \`ARCADE_MAX_ROM_MB\` | \`24\` | optional, upper bound 64 MB |
| \`ARCADE_EMULATORJS_DATA_URL\` | \`https://cdn.emulatorjs.org/stable/data/\` | optional; vendor/pin for production |

In Authentik:
1. Create an OAuth2/OpenID Provider + application with redirect URI **exactly** \`https://arcade.example.ch/auth/callback\`. Grant Authorization Code + PKCE. Configure an RS256-signed ID token, issuer, and client secret correctly.
2. Configure a **verified groups claim** under \`groups\` (OIDC ID-token or userinfo) and assign your users \`arcade-users\`. Grant **only a separate trusted admin** \`arcade-admins\`; do not rely on email, usernames or frontend hidden links for admin roles.
3. Optional upstream MFA policy on Authentik. Restrict account enrollment and approve users there. Test separate user and admin accounts.
4. Configure a **persistent Coolify volume** from host storage to container path \`/data/arcade\`, with sufficient free disk. Back it up and restrict host permissions. **ROM files never enter Git.**
5. Serve via HTTPS with valid browser-trusted certificate. Existing LAN \`http://10.0.60.139:8099/\` must not be used for real Authentik login and this beta refuses non-localhost plain HTTP; use TLS ingress.
6. Set server-side secrets and redeploy from **this PR branch only after review**. The repo's \`deploy.ps1\` pushes \`main\`; it has not been changed or run.

## Workflow

- All pages/assets and legacy games are gated by nginx \`auth_request\` to \`/internal/auth/check\`. Login flow uses OIDC PKCE/state/nonce and server-side RS256 ID-token signature/JWKS verification. Sessions are HttpOnly, SameSite=Lax, Secure on HTTPS.
- The Arcade loads \`/api/catalog\`, showing only active/nonhidden entries; local game folders remain supported. External titles link to an HTTPS site in a new tab. There is *no iframe embedding* for third-party content.
- Under \`/admin/\` (Authentik group \`arcade-admins\` required) admins upload approved **SNES / Sega Mega Drive ROMs**, add HTTPS game links, rename titles, toggle visibility, archive/restore and reorder everything (including existing games). **No destructive ROM-delete endpoint.**
- Persistent \`/data/arcade/library.json\` holds metadata and \`/data/arcade/roms\` holds the binary files. The readonly \`public/games.json\` remains the baseline for preexisting titles. JSON writes are temp+rename; worker/RAM persistence is not part of the backup.
- Each ROM upload requires a plain-language **rights justification and affirmative confirmation**. Only per-console extensions accepted; size limit, server-generated filename, SHA-256 hash and no browser-executable file serving. Licensing isn't verified automatically: administrator is responsible for permission to redistribute/serve ROMs. **No Nintendo/Sega commercial ROMs or BIOSes are supplied.**
- ROMs are retrieved only through session-gated \`/api/roms/:id/file\` with byte-range support; hidden/archived content unavailable to non-admins. Do not put ROMs in \`public/\`.
- EmulatorJS is currently loaded on demand through the official CDN; if offline, the emulator **will not start**. Before a closed/offline production deployment, pin and self-host a properly licensed EmulatorJS release, audit license/dependencies and apply a content security policy compatible with the legacy games. This PR does not vendor external emulator binary assets.
- Mobile touch and browser Gamepad API support depend on EmulatorJS and the actual browser. **Tesla browser/gamepad behavior is unverified**; test only when parked. Use a real paired controller and HTTPS origin. Bluetooth pairing is done by the device OS, not the Arcade.
- Sessions are **in-memory**, so redeploys invalidate logins. Revoke access in Authentik and restart service for an immediate forced session purge; production-grade distributed sessions, logout at IdP, admin audit logs, user-level game saves and external game iframe policy are follow-up work.

## Manual smoke test (required before merge)

1. With no OIDC config, \`GET /health\` at API is 503 and all page/ROM URLs are inaccessible.
2. With valid OIDC, anonymous visitors to \`/\`, \`/games/2048/\`, \`/retro/\`, \`/admin/\` are redirected to login. Authentik regular user sees games but \`/admin/\` and all admin API routes return 403.
3. An admin can upload an explicitly licensed homebrew \`.sfc\` and \`.md\`, reload catalog, open both in EmulatorJS on desktop and mobile.
4. Move a game up/down; hide, archive and restore; verify metadata/ROM survive a container redeploy on persistent volume. No delete behavior.
5. Direct \`/api/roms/<id>/file\` requests without a session return 401. Hidden/archived ROMs return 404 for normal users. Invalid extensions, oversized binary, missing rights acknowledgement and cross-origin mutations fail.
6. Existing local games including websocket-proxied Blockfront still work after login. Check mobile UX and Bluetooth controller with real hardware. Verify Tesla compatibility experimentally and only while parked.
7. \`docker build\`, \`nginx -t\` and \`node --test tests/retro-auth.test.mjs\`; no production deployment performed by this branch.

## Security / scope boundaries

The service intentionally does not allow arbitrary ROM deletion, arbitrary executable uploads, public ROM download, browser-based local-file admin, paid ROM catalogs, site-wide game mirroring, or direct unauthenticated static-file access. Before a public-facing release consider rate limits, security headers/CSP, IdP logout, session store, audit, backup restore tests, ROM malware/content vetting, licensing review, game-source sandboxing, and full end-to-end browser tests.
