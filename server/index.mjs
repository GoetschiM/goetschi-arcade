import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const STATIC_DIR = process.env.ARCADE_STATIC_DIR || '/usr/share/nginx/html';
const DATA_DIR = process.env.ARCADE_DATA_DIR || '/data/arcade';
const ROM_DIR = path.join(DATA_DIR, 'roms');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const PORT = Number(process.env.ARCADE_API_PORT || 3000);
const ISSUER = (process.env.AUTHENTIK_ISSUER || '').replace(/\/+$/, '');
const CLIENT_ID = process.env.AUTHENTIK_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AUTHENTIK_CLIENT_SECRET || '';
const PUBLIC_URL = process.env.ARCADE_PUBLIC_URL || '';
const USERS = splitGroups(process.env.ARCADE_USER_GROUPS || 'arcade-users,arcade-admins');
const ADMINS = splitGroups(process.env.ARCADE_ADMIN_GROUPS || 'arcade-admins');
const MAX_ROM_BYTES = Math.min(64, Math.max(1, Number(process.env.ARCADE_MAX_ROM_MB || 24))) * 1024 * 1024;
const EJS_DATA_URL = process.env.ARCADE_EMULATORJS_DATA_URL || 'https://cdn.emulatorjs.org/stable/data/';
const COOKIE = 'arcade_session';
const FLOW_COOKIE = 'arcade_oidc_state';
const SESSION_MS = 12 * 60 * 60 * 1000;
const SYSTEM_EXT = {
  snes: new Set(['.sfc', '.smc', '.fig', '.swc']),
  segaMD: new Set(['.md', '.gen', '.bin', '.smd'])
};
const flows = new Map();
const sessions = new Map();
let discoveryCache;
let discoveryExpires = 0;

fs.mkdirSync(ROM_DIR, { recursive: true, mode: 0o700 });

function splitGroups(value) {
  return new Set(value.split(',').map(x => x.trim()).filter(Boolean));
}
function configured() {
  try {
    const u = new URL(PUBLIC_URL);
    const i = new URL(ISSUER);
    const secure = u.protocol === 'https:' && i.protocol === 'https:';
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)
      && i.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(i.hostname);
    return !!(CLIENT_ID && CLIENT_SECRET && (secure || local) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash
      && EJS_DATA_URL.startsWith('https://'));
  } catch { return false; }
}
function publicOrigin() { return new URL(PUBLIC_URL).origin; }
function cookieSecure() { return new URL(PUBLIC_URL).protocol === 'https:'; }
function random() { return crypto.randomBytes(32).toString('base64url'); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('base64url'); }
function getCookies(req) {
  const out = {};
  for (const pair of (req.headers.cookie || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}
function setCookie(name, value, maxAge) {
  return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (cookieSecure() ? '; Secure' : '');
}
function sessionFor(req) {
  const token = getCookies(req)[COOKIE];
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires <= Date.now()) { sessions.delete(token); return null; }
  return s;
}
function reply(res, status, payload, headers = {}) {
  if (res.headersSent) return;
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers
  });
  res.end(text);
}
function redirect(res, target, cookies) {
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-store', ...(cookies ? { 'Set-Cookie': cookies } : {}) });
  res.end();
}
function fail(res, status, message) { reply(res, status, { error: message }); }
function requireSession(req, res, admin = false) {
  const session = sessionFor(req);
  if (!session) { fail(res, 401, 'Bitte zuerst anmelden.'); return null; }
  if (admin && !session.admin) { fail(res, 403, 'Nur fuer Administratoren.'); return null; }
  return session;
}
function requireMutation(req, res, session) {
  const origin = req.headers.origin;
  if (origin !== publicOrigin() || req.headers['x-csrf-token'] !== session.csrf) {
    fail(res, 403, 'CSRF-Pruefung fehlgeschlagen.'); return false;
  }
  return true;
}
function validateText(value, label, max = 120, required = true) {
  if (typeof value !== 'string') throw new HttpError(400, label + ' muss Text sein.');
  const text = value.trim();
  if ((required && !text) || text.length > max) throw new HttpError(400, label + ' ungueltig.');
  return text;
}
function httpsUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hostname === 'localhost') throw new Error('protocol');
    return u.href;
  } catch { throw new HttpError(400, 'Nur gueltige HTTPS-Links sind erlaubt.'); }
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function readJson(req, max = 16384) {
  let data = '';
  for await (const chunk of req) {
    data += chunk.toString('utf8');
    if (data.length > max) throw new HttpError(413, 'Anfrage zu gross.');
  }
  try { return JSON.parse(data); } catch { throw new HttpError(400, 'Ungueltiges JSON.'); }
}
function readDatabase() {
  if (!fs.existsSync(DB_FILE)) return { version: 1, entries: [], overrides: {} };
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!Array.isArray(db.entries) || !db.overrides || typeof db.overrides !== 'object') throw new Error('Bibliotheksdaten ungueltig');
  return db;
}
function writeDatabase(db) {
  const tmp = DB_FILE + '.tmp-' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, DB_FILE);
}
function builtins() {
  const data = JSON.parse(fs.readFileSync(path.join(STATIC_DIR, 'games.json'), 'utf8'));
  return (data.games || []).map((game, index) => ({
    ...game, id: 'local:' + game.slug, type: 'local', order: index, hidden: false, archived: false
  }));
}
function everyGame(db) {
  const originals = builtins();
  const locals = originals.map(g => ({ ...g, ...(db.overrides[g.id] || {}), id: g.id, type: 'local' }));
  return [...locals, ...db.entries].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.title.localeCompare(b.title));
}
function publishedGame(g) {
  const base = {
    id: g.id, type: g.type, title: g.title, subtitle: g.subtitle || '',
    description: g.description || '', cover: g.cover || '', tags: g.tags || [],
    controls: g.controls || '', accent: g.accent || '#5ec9ba'
  };
  if (g.type === 'local') base.href = '/games/' + encodeURIComponent(g.slug) + '/';
  else if (g.type === 'retro') {
    base.href = '/retro/?id=' + encodeURIComponent(g.id.slice(6));
    base.system = g.system;
  } else if (g.type === 'external') {
    base.href = g.url; base.external = true;
  }
  return base;
}
function findGame(db, id) { return everyGame(db).find(g => g.id === id); }
function romFor(req, res, id) {
  const s = requireSession(req, res);
  if (!s) return null;
  const game = findGame(readDatabase(), 'retro:' + id);
  if (!game || game.type !== 'retro' || ((!game.hidden && !game.archived) === false && !s.admin)) {
    fail(res, 404, 'Spiel nicht gefunden.'); return null;
  }
  return game;
}
function cleanupSessions() {
  const now = Date.now();
  for (const [key, s] of sessions) if (s.expires < now) sessions.delete(key);
  for (const [key, s] of flows) if (s.expires < now) flows.delete(key);
}
async function readRemoteJson(url, init = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('Unsafe OIDC endpoint');
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('OIDC HTTP ' + response.status);
  return response.json();
}
async function discovery() {
  if (discoveryCache && discoveryExpires > Date.now()) return discoveryCache;
  const d = await readRemoteJson(ISSUER + '/.well-known/openid-configuration');
  if (d.issuer.replace(/\/+$/, '') !== ISSUER) throw new Error('OIDC issuer mismatch');
  for (const endpoint of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint']) {
    if (typeof d[endpoint] !== 'string' || new URL(d[endpoint]).origin !== new URL(ISSUER).origin) {
      throw new Error('OIDC endpoint does not match Authentik origin: ' + endpoint);
    }
  }
  discoveryCache = d;
  discoveryExpires = Date.now() + 15 * 60 * 1000;
  return d;
}
function decodeJWT(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token');
  return {
    header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
    message: Buffer.from(parts[0] + '.' + parts[1]),
    signature: Buffer.from(parts[2], 'base64url')
  };
}
async function validateIdToken(token, expectedNonce, oidc) {
  const jwt = decodeJWT(token);
  if (jwt.header.alg !== 'RS256' || !jwt.header.kid) throw new Error('Unsupported ID token signing algorithm');
  const keys = await readRemoteJson(oidc.jwks_uri);
  const jwk = (keys.keys || []).find(k => k.kid === jwt.header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
  if (!jwk) throw new Error('Unknown Authentik signing key');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  if (!crypto.verify('RSA-SHA256', jwt.message, key, jwt.signature)) throw new Error('Invalid Authentik token signature');
  const c = jwt.payload, now = Math.floor(Date.now() / 1000);
  if (String(c.iss).replace(/\/+$/, '') !== ISSUER || !(Array.isArray(c.aud) ? c.aud.includes(CLIENT_ID) : c.aud === CLIENT_ID)
    || (Array.isArray(c.aud) && c.aud.length > 1 && c.azp !== CLIENT_ID)
    || !c.sub || c.nonce !== expectedNonce || !Number.isFinite(c.exp) || c.exp <= now - 60
    || !Number.isFinite(c.iat) || c.iat > now + 60 || (c.nbf && c.nbf > now + 60)) throw new Error('OIDC claim validation failed');
  return c;
}
function allowedGroups(idClaims, userInfo) {
  const result = new Set();
  for (const source of [idClaims, userInfo]) {
    for (const x of Array.isArray(source.groups) ? source.groups : []) if (typeof x === 'string') result.add(x);
  }
  return result;
}
async function login(req, res, url) {
  const oidc = await discovery();
  const state = random();
  const verifier = random();
  const nonce = random();
  const next = url.searchParams.get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';
  flows.set(state, { verifier, nonce, next: safeNext, expires: Date.now() + 10 * 60 * 1000 });
  const u = new URL(oidc.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', publicOrigin() + '/auth/callback');
  u.searchParams.set('scope', 'openid profile email');
  u.searchParams.set('state', state);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', sha256(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  redirect(res, u.href, setCookie(FLOW_COOKIE, state, 600));
}
async function callback(req, res, url) {
  const state = url.searchParams.get('state') || '';
  const flow = flows.get(state);
  flows.delete(state);
  if (!flow || flow.expires < Date.now() || getCookies(req)[FLOW_COOKIE] !== state) {
    throw new HttpError(400, 'Anmeldung abgelaufen oder ungueltig.');
  }
  if (url.searchParams.get('error')) throw new HttpError(401, 'Authentik hat die Anmeldung abgelehnt.');
  const code = url.searchParams.get('code');
  if (!code) throw new HttpError(400, 'Fehlender Login-Code.');
  const oidc = await discovery();
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: publicOrigin() + '/auth/callback',
    client_id: CLIENT_ID, code_verifier: flow.verifier
  });
  const token = await readRemoteJson(oidc.token_endpoint, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const claims = await validateIdToken(token.id_token, flow.nonce, oidc);
  const profile = await readRemoteJson(oidc.userinfo_endpoint, {
    headers: { Authorization: 'Bearer ' + token.access_token }
  });
  if (profile.sub !== claims.sub) throw new Error('OIDC userinfo subject mismatch');
  const groups = allowedGroups(claims, profile);
  const admin = [...groups].some(g => ADMINS.has(g));
  const permitted = admin || [...groups].some(g => USERS.has(g));
  if (!permitted) throw new HttpError(403, 'Dein Konto ist fuer die Arcade noch nicht freigegeben.');
  const sid = random();
  sessions.set(sid, {
    id: ISSUER + ':' + claims.sub, name: profile.preferred_username || profile.name || claims.sub,
    admin, csrf: random(), expires: Date.now() + SESSION_MS
  });
  redirect(res, flow.next, [setCookie(COOKIE, sid, SESSION_MS / 1000), setCookie(FLOW_COOKIE, '', 0)]);
}
function binaryRom(req, res, game) {
  const filename = path.join(ROM_DIR, game.filename);
  let stat;
  try { stat = fs.statSync(filename); } catch { return fail(res, 404, 'ROM nicht gefunden.'); }
  const length = stat.size;
  let start = 0, end = length - 1, status = 200;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return reply(res, 416, { error: 'Ungueltiger Byte-Bereich.' }, { 'Content-Range': 'bytes */' + length });
    start = Number(match[1]); end = match[2] ? Number(match[2]) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end >= length) {
      return reply(res, 416, { error: 'Bereich ausserhalb der Datei.' }, { 'Content-Range': 'bytes */' + length });
    }
    status = 206;
  }
  const headers = {
    'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1,
    'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
  };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + length;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filename, { start, end }).on('error', () => res.destroy()).pipe(res);
}
async function uploadRom(req) {
  const encoded = String(req.headers['x-arcade-metadata'] || '');
  if (encoded.length > 4096) throw new HttpError(400, 'Metadaten zu lang.');
  let meta;
  try { meta = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw new HttpError(400, 'ROM-Metadaten ungueltig.'); }
  const title = validateText(meta.title, 'Spielname');
  const system = validateText(meta.system, 'Konsole', 12);
  if (!SYSTEM_EXT[system]) throw new HttpError(400, 'Konsole nicht unterstuetzt.');
  const sourceName = validateText(meta.filename, 'Dateiname', 255);
  const ext = path.extname(sourceName).toLowerCase();
  if (!SYSTEM_EXT[system].has(ext) || /[\/\\]/.test(sourceName)) throw new HttpError(400, 'ROM-Dateityp fuer diese Konsole ungueltig.');
  if (meta.rightsConfirmed !== true) throw new HttpError(400, 'Rechtebestaetigung erforderlich.');
  const rightsNote = validateText(meta.rightsNote, 'Rechtenachweis', 500);
  const sourceUrl = meta.sourceUrl ? httpsUrl(meta.sourceUrl) : '';
  if (req.headers['content-type'] !== 'application/octet-stream') throw new HttpError(415, 'Nur binaere ROM-Uploads erlaubt.');
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_ROM_BYTES) throw new HttpError(413, 'ROM ueberschreitet das Limit.');
  const id = crypto.randomUUID();
  const filename = id + ext;
  const tmp = path.join(ROM_DIR, '.upload-' + id);
  const final = path.join(ROM_DIR, filename);
  let size = 0;
  const hash = crypto.createHash('sha256');
  try {
    await pipeline(req, new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_ROM_BYTES) return callback(new HttpError(413, 'ROM zu gross.'));
        hash.update(chunk); callback(null, chunk);
      }
    }), fs.createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
    if (size === 0) throw new HttpError(400, 'ROM ist leer.');
    fs.renameSync(tmp, final);
    const db = readDatabase();
    const game = {
      id: 'retro:' + id, type: 'retro', title, system, filename, sourceName,
      rightsNote, sourceUrl, sha256: hash.digest('hex'), bytes: size,
      description: '', hidden: false, archived: false, order: everyGame(db).length,
      createdAt: new Date().toISOString()
    };
    db.entries.push(game);
    try { writeDatabase(db); }
    catch (err) { fs.rmSync(final, { force: true }); throw err; }
    return game;
  } finally { fs.rmSync(tmp, { force: true }); }
}
async function api(req, res, pathname) {
  const session = requireSession(req, res, pathname.startsWith('/api/admin/'));
  if (!session) return;
  if (req.method === 'GET' && pathname === '/api/session') {
    return reply(res, 200, { user: session.name, admin: session.admin, csrf: session.csrf });
  }
  if (req.method === 'GET' && pathname === '/api/catalog') {
    return reply(res, 200, { games: everyGame(readDatabase()).filter(x => !x.archived && !x.hidden).map(publishedGame) });
  }
  if (req.method === 'GET' && pathname === '/api/admin/library') {
    return reply(res, 200, { games: everyGame(readDatabase()), maxRomMb: MAX_ROM_BYTES / 1048576 });
  }
  let m = /^\/api\/retro\/([0-9a-f-]{36})$/.exec(pathname);
  if (m && req.method === 'GET') {
    const g = romFor(req, res, m[1]);
    if (g) return reply(res, 200, {
      id: m[1], title: g.title, system: g.system, core: g.system,
      gameUrl: '/api/roms/' + m[1] + '/file', dataUrl: EJS_DATA_URL
    });
    return;
  }
  m = /^\/api\/roms\/([0-9a-f-]{36})\/file$/.exec(pathname);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const g = romFor(req, res, m[1]);
    if (g) binaryRom(req, res, g);
    return;
  }
  if (!pathname.startsWith('/api/admin/')) return fail(res, 404, 'Unbekannter Endpunkt.');
  if (!requireMutation(req, res, session)) return;
  if (req.method === 'POST' && pathname === '/api/admin/roms') {
    const g = await uploadRom(req);
    return reply(res, 201, { game: g });
  }
  if (req.method === 'POST' && pathname === '/api/admin/links') {
    const body = await readJson(req);
    const db = readDatabase();
    const g = {
      id: 'external:' + crypto.randomUUID(), type: 'external',
      title: validateText(body.title, 'Spielname'),
      description: validateText(body.description || '', 'Beschreibung', 500, false),
      url: httpsUrl(body.url), hidden: false, archived: false,
      order: everyGame(db).length, createdAt: new Date().toISOString()
    };
    db.entries.push(g); writeDatabase(db);
    return reply(res, 201, { game: g });
  }
  m = /^\/api\/admin\/games\/([^/]+)$/.exec(pathname);
  if (m && req.method === 'PATCH') {
    const id = decodeURIComponent(m[1]);
    const db = readDatabase();
    const g = findGame(db, id);
    if (!g) return fail(res, 404, 'Spiel nicht gefunden.');
    const body = await readJson(req);
    const allowed = new Set(['title', 'description', 'hidden', 'archived']);
    if (Object.keys(body).some(k => !allowed.has(k)) || !Object.keys(body).length)
      return fail(res, 400, 'Unbekanntes Editierfeld.');
    const patch = {};
    if ('title' in body) patch.title = validateText(body.title, 'Titel');
    if ('description' in body) patch.description = validateText(body.description, 'Beschreibung', 500, false);
    if ('hidden' in body) {
      if (typeof body.hidden !== 'boolean') return fail(res, 400, 'hidden muss boolean sein.');
      patch.hidden = body.hidden;
    }
    if ('archived' in body) {
      if (typeof body.archived !== 'boolean') return fail(res, 400, 'archived muss boolean sein.');
      patch.archived = body.archived;
    }
    if (id.startsWith('local:')) db.overrides[id] = { ...(db.overrides[id] || {}), ...patch };
    else Object.assign(db.entries.find(x => x.id === id), patch);
    writeDatabase(db);
    return reply(res, 200, { game: findGame(db, id) });
  }
  if (req.method === 'PUT' && pathname === '/api/admin/order') {
    const body = await readJson(req);
    const db = readDatabase();
    const all = everyGame(db);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length !== all.length || new Set(ids).size !== all.length
      || ids.some(id => !all.some(g => g.id === id))) return fail(res, 400, 'Reihenfolge unvollstaendig.');
    ids.forEach((id, order) => {
      if (id.startsWith('local:')) db.overrides[id] = { ...(db.overrides[id] || {}), order };
      else db.entries.find(g => g.id === id).order = order;
    });
    writeDatabase(db);
    return reply(res, 200, { ok: true });
  }
  return fail(res, 404, 'Unbekannter Admin-Endpunkt.');
}
async function handle(req, res) {
  cleanupSessions();
  const u = new URL(req.url || '/', 'http://localhost');
  const p = u.pathname;
  if (p === '/health') return reply(res, configured() ? 200 : 503, { configured: configured() });
  if (!configured()) return fail(res, 503, 'Arcade-Login ist noch nicht konfiguriert. Siehe README.');
  if (p === '/internal/auth/check' && req.method === 'GET') {
    const s = sessionFor(req);
    if (!s) return fail(res, 401, 'Nicht angemeldet.');
    if (String(req.headers['x-original-uri'] || '').startsWith('/admin/') && !s.admin)
      return fail(res, 403, 'Kein Admin.');
    res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end();
  }
  if (req.method === 'GET' && p === '/auth/login') return login(req, res, u);
  if (req.method === 'GET' && p === '/auth/callback') return callback(req, res, u);
  if (req.method === 'POST' && p === '/auth/logout') {
    const s = requireSession(req, res);
    if (!s || !requireMutation(req, res, s)) return;
    sessions.delete(getCookies(req)[COOKIE]);
    return reply(res, 200, { ok: true }, { 'Set-Cookie': setCookie(COOKIE, '', 0) });
  }
  if (p.startsWith('/api/')) return api(req, res, p);
  fail(res, 404, 'Unbekannter Endpunkt.');
}
http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error('Arcade API:', err.status ? err.message : err);
    if (!res.headersSent) fail(res, err.status || 500, err.status ? err.message : 'Interner Fehler.');
    else res.destroy();
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Arcade auth/admin API listening on 127.0.0.1:' + PORT
    + (configured() ? '' : ' (NOT CONFIGURED: fail closed)'));
});
