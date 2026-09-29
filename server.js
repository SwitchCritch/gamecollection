const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'collection.json');
const MOBYGAMES_API_KEY = process.env.MOBYGAMES_API_KEY || '';
const MOBYGAMES_BASE = 'https://api.mobygames.com/v1';
const COOKIE_NAME = 'cgc_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.createHash('sha256').update(`critchell-game-collection:${ADMIN_PASSWORD}`).digest('hex');

fs.mkdirSync(DATA_DIR, { recursive: true });

const platformGroups = {
  'Nintendo': ['Nintendo Entertainment System (NES)','Super Nintendo (SNES)','Nintendo 64','Nintendo GameCube','Nintendo Wii','Nintendo Wii U','Nintendo Switch','Nintendo Switch 2','Game Boy','Game Boy Color','Game Boy Advance','Nintendo DS','Nintendo 3DS','Virtual Boy'],
  'PlayStation': ['PlayStation','PlayStation 2','PlayStation 3','PlayStation 4','PlayStation 5','PSP','PlayStation Vita'],
  'Xbox': ['Xbox','Xbox 360','Xbox One','Xbox Series X/S'],
  'Sega': ['Master System','Mega Drive / Genesis','Mega-CD / Sega CD','32X','Saturn','Dreamcast','Game Gear'],
  'Atari': ['Atari 2600','Atari 5200','Atari 7800','Atari Jaguar','Atari Lynx','Atari ST'],
  'NEC / SNK / Other': ['PC Engine / TurboGrafx-16','Neo Geo AES','Neo Geo CD','Neo Geo Pocket','Neo Geo Pocket Color','3DO','Philips CD-i','Amiga CD32','WonderSwan','WonderSwan Color'],
  'Computers': ['Windows PC','MS-DOS','macOS','Amiga','Commodore 64','ZX Spectrum','Amstrad CPC','MSX'],
  'Mobile / Other': ['iOS','Android','Other / Custom']
};

const stores = ['Steam','Epic Games Store','GOG','Rockstar Games Launcher','EA App','Ubisoft Connect','Microsoft Store / Xbox App','Battle.net','itch.io','Nintendo eShop','PlayStation Store','Xbox Store','Amazon Games','Other'];
const statuses = ['Backlog','Playing','Completed','100% / Platinum','Paused','Dropped','Unplayed'];

function freshDb() {
  return {
    version: 2,
    settings: {
      title: 'CRITCHELL GAME COLLECTION',
      subtitle: 'My personal gaming library',
      createdAt: new Date().toISOString()
    },
    platformGroups,
    stores,
    statuses,
    games: []
  };
}

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) {
    const db = freshDb();
    saveDb(db);
    return db;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db.platformGroups ||= platformGroups;
    db.stores ||= stores;
    db.statuses ||= statuses;
    db.games ||= [];
    db.settings ||= freshDb().settings;
    return db;
  } catch (e) {
    const backup = `${DATA_FILE}.broken-${Date.now()}`;
    try { fs.copyFileSync(DATA_FILE, backup); } catch {}
    const db = freshDb();
    saveDb(db);
    return db;
  }
}

function saveDb(db) {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function normalizeCopy(copy = {}) {
  const type = copy.type === 'Digital' ? 'Digital' : 'Physical';
  return {
    id: copy.id || crypto.randomUUID(),
    platform: String(copy.platform || '').trim(),
    type,
    store: type === 'Digital' ? String(copy.store || '').trim() : '',
    region: String(copy.region || '').trim(),
    edition: String(copy.edition || 'Standard').trim(),
    box: Boolean(copy.box),
    manual: Boolean(copy.manual),
    media: Boolean(copy.media),
    steelbook: Boolean(copy.steelbook),
    notes: String(copy.notes || '').trim(),
    addedAt: copy.addedAt || new Date().toISOString()
  };
}

function normalizeGame(body, existing = {}) {
  const copies = Array.isArray(body.copies) ? body.copies.map(normalizeCopy).filter(c => c.platform) : [];
  return {
    id: existing.id || body.id || crypto.randomUUID(),
    title: String(body.title || '').trim(),
    sortTitle: String(body.sortTitle || body.title || '').trim(),
    cover: String(body.cover || '').trim(),
    releaseDate: String(body.releaseDate || '').trim(),
    developer: String(body.developer || '').trim(),
    publisher: String(body.publisher || '').trim(),
    genres: Array.isArray(body.genres) ? body.genres.map(String).map(s => s.trim()).filter(Boolean) : String(body.genres || '').split(',').map(s => s.trim()).filter(Boolean),
    description: String(body.description || '').trim(),
    status: String(body.status || 'Backlog').trim(),
    favourite: Boolean(body.favourite),
    rating: Math.max(0, Math.min(10, Number(body.rating) || 0)),
    notes: String(body.notes || '').trim(),
    source: body.source && typeof body.source === 'object' ? {
      provider: String(body.source.provider || '').trim(),
      id: String(body.source.id || '').trim(),
      url: String(body.source.url || '').trim()
    } : (existing.source || null),
    copies,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ---------- Admin authentication ----------
function adminConfig() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return null;
  return { username: ADMIN_USERNAME, sessionSecret: ADMIN_SESSION_SECRET };
}

function constantTimeTextEqual(a, b) {
  const aa = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aa, bb);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function signSession(auth) {
  const payload = Buffer.from(JSON.stringify({ u: auth.username, exp: Date.now() + SESSION_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(req) {
  const auth = adminConfig();
  if (!auth) return null;
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.u !== auth.username || !data.exp || Date.now() > data.exp) return null;
    return { username: auth.username };
  } catch { return null; }
}

function setSessionCookie(req, res, auth) {
  res.cookie(COOKIE_NAME, signSession(auth), {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(req.secure || req.get('x-forwarded-proto') === 'https'),
    maxAge: SESSION_MS,
    path: '/'
  });
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(req.secure || req.get('x-forwarded-proto') === 'https'),
    path: '/'
  });
}

function requireAdmin(req, res, next) {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Admin login required' });
  req.admin = session;
  next();
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/auth/status', (req, res) => {
  const cfg = adminConfig();
  const session = verifySession(req);
  res.json({ configured: Boolean(cfg), authenticated: Boolean(session), username: session?.username || null });
});

app.post('/api/auth/login', (req, res) => {
  const cfg = adminConfig();
  if (!cfg) return res.status(503).json({ error: 'Admin login is not configured. Add ADMIN_USERNAME and ADMIN_PASSWORD in Railway → Variables.' });
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!constantTimeTextEqual(username, ADMIN_USERNAME) || !constantTimeTextEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  setSessionCookie(req, res, cfg);
  res.json({ ok: true, username: cfg.username });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

function cleanLookupText(value = '') {
  return String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function mobyPlatformNames(game = {}) {
  return (game.platforms || []).map(p => p?.platform_name || p?.name).filter(Boolean);
}

function mobyGenreNames(game = {}) {
  return (game.genres || []).map(g => g?.genre_name || g?.name).filter(Boolean);
}

function mobyCompanyNames(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(x => {
    if (typeof x === 'string') return x;
    return x?.developer_name || x?.publisher_name || x?.company_name || x?.name || '';
  }).filter(Boolean);
}

function mobyCover(game = {}) {
  return game.sample_cover?.image || game.sample_cover?.thumbnail_image || '';
}

function mobyReleaseDate(game = {}) {
  const dates = (game.platforms || []).map(p => p?.first_release_date).filter(Boolean).sort();
  return dates[0] || game.release_date || '';
}

function mapMobySearchResult(game = {}) {
  const releaseDate = mobyReleaseDate(game);
  return {
    id: game.game_id ?? game.id,
    title: game.title || '',
    releaseDate,
    year: releaseDate ? String(releaseDate).slice(0, 4) : '',
    cover: mobyCover(game),
    platforms: mobyPlatformNames(game),
    genres: mobyGenreNames(game),
    score: game.moby_score ?? null,
    sourceUrl: game.moby_url || ''
  };
}

async function mobyFetch(pathname, params = {}) {
  const url = new URL(`${MOBYGAMES_BASE}${pathname}`);
  url.searchParams.set('api_key', MOBYGAMES_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CritchellGameCollection/1.3',
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || body?.error || '';
    } catch {}
    const err = new Error(`MobyGames returned ${response.status}${detail ? `: ${detail}` : ''}`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

// Lookup is admin-only because it feeds the Add/Edit form.
app.get('/api/lookup/status', requireAdmin, (req, res) => {
  res.json({
    provider: 'MobyGames',
    configured: Boolean(MOBYGAMES_API_KEY),
    attributionUrl: 'https://www.mobygames.com/'
  });
});

app.get('/api/lookup/search', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Enter a game title to search' });
  if (!MOBYGAMES_API_KEY) {
    return res.status(503).json({ error: 'Automatic game lookup needs MOBYGAMES_API_KEY in Railway → Variables.' });
  }
  try {
    const data = await mobyFetch('/games', { title: q, format: 'normal', limit: 12 });
    res.json({ provider: 'MobyGames', query: q, results: (data.games || []).map(mapMobySearchResult) });
  } catch (err) {
    console.error('MobyGames search failed:', err);
    if (err.status === 401) return res.status(502).json({ error: 'MobyGames rejected the API key. Check MOBYGAMES_API_KEY in Railway → Variables.' });
    if (err.status === 429) return res.status(429).json({ error: 'MobyGames rate limit reached. Wait a few seconds and try again.' });
    res.status(502).json({ error: 'Could not search MobyGames right now. Please try again.' });
  }
});

app.get('/api/lookup/game/:id', requireAdmin, async (req, res) => {
  if (!MOBYGAMES_API_KEY) {
    return res.status(503).json({ error: 'Automatic game lookup needs MOBYGAMES_API_KEY in Railway → Variables.' });
  }
  try {
    const g = await mobyFetch(`/games/${encodeURIComponent(req.params.id)}`, { format: 'normal' });
    const releaseDate = mobyReleaseDate(g);
    const developers = mobyCompanyNames(g.developers || g.developer || g.companies?.developers);
    const publishers = mobyCompanyNames(g.publishers || g.publisher || g.companies?.publishers);
    res.json({
      id: g.game_id ?? g.id,
      title: g.title || '',
      releaseDate,
      cover: mobyCover(g),
      developer: developers.join(', '),
      publisher: publishers.join(', '),
      genres: mobyGenreNames(g),
      description: cleanLookupText(g.description || g.game_description || ''),
      platforms: mobyPlatformNames(g),
      website: g.official_url || '',
      source: {
        provider: 'MobyGames',
        id: String(g.game_id ?? g.id ?? req.params.id),
        url: g.moby_url || 'https://www.mobygames.com/'
      }
    });
  } catch (err) {
    console.error('MobyGames detail failed:', err);
    if (err.status === 401) return res.status(502).json({ error: 'MobyGames rejected the API key. Check MOBYGAMES_API_KEY in Railway → Variables.' });
    if (err.status === 429) return res.status(429).json({ error: 'MobyGames rate limit reached. Wait a few seconds and try again.' });
    res.status(502).json({ error: 'Could not load that game from MobyGames right now.' });
  }
});

// ---------- Public read-only collection ----------
app.get('/api/config', (req, res) => {
  const db = loadDb();
  res.json({ settings: db.settings, platformGroups: db.platformGroups, stores: db.stores, statuses: db.statuses });
});

app.get('/api/games', (req, res) => {
  const db = loadDb();
  res.json(db.games.sort((a,b) => (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title)));
});

app.get('/api/games/:id', (req, res) => {
  const db = loadDb();
  const game = db.games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

app.get('/api/stats', (req, res) => {
  const db = loadDb();
  const copies = db.games.flatMap(g => g.copies || []);
  res.json({
    games: db.games.length,
    copies: copies.length,
    physical: copies.filter(c => c.type === 'Physical').length,
    digital: copies.filter(c => c.type === 'Digital').length,
    platforms: new Set(copies.map(c => c.platform).filter(Boolean)).size,
    completed: db.games.filter(g => ['Completed','100% / Platinum'].includes(g.status)).length,
    favourites: db.games.filter(g => g.favourite).length
  });
});

// ---------- Admin-only mutation / management ----------
app.get('/api/health', requireAdmin, (req, res) => {
  res.json({ ok: true, dataDir: DATA_DIR, persistent: DATA_DIR === '/data', lookupConfigured: Boolean(MOBYGAMES_API_KEY) });
});

app.post('/api/games', requireAdmin, (req, res) => {
  const db = loadDb();
  const game = normalizeGame(req.body);
  if (!game.title) return res.status(400).json({ error: 'Title is required' });
  if (!game.copies.length) return res.status(400).json({ error: 'Add at least one owned copy/platform' });
  db.games.push(game);
  saveDb(db);
  res.status(201).json(game);
});

app.put('/api/games/:id', requireAdmin, (req, res) => {
  const db = loadDb();
  const index = db.games.findIndex(g => g.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Game not found' });
  const game = normalizeGame(req.body, db.games[index]);
  if (!game.title) return res.status(400).json({ error: 'Title is required' });
  if (!game.copies.length) return res.status(400).json({ error: 'Add at least one owned copy/platform' });
  db.games[index] = game;
  saveDb(db);
  res.json(game);
});

app.delete('/api/games/:id', requireAdmin, (req, res) => {
  const db = loadDb();
  const before = db.games.length;
  db.games = db.games.filter(g => g.id !== req.params.id);
  if (db.games.length === before) return res.status(404).json({ error: 'Game not found' });
  saveDb(db);
  res.json({ ok: true });
});

app.get('/api/export', requireAdmin, (req, res) => {
  const db = loadDb();
  res.setHeader('Content-Disposition', `attachment; filename="critchell-game-collection-${new Date().toISOString().slice(0,10)}.json"`);
  res.type('application/json').send(JSON.stringify(db, null, 2));
});

app.post('/api/import', requireAdmin, (req, res) => {
  const incoming = req.body;
  if (!incoming || !Array.isArray(incoming.games)) return res.status(400).json({ error:'Invalid backup file' });
  const db = loadDb();
  const imported = {
    ...freshDb(),
    ...incoming,
    platformGroups: incoming.platformGroups || db.platformGroups || platformGroups,
    stores: incoming.stores || db.stores || stores,
    statuses: incoming.statuses || db.statuses || statuses,
    games: incoming.games.map(g => normalizeGame(g, g))
  };
  saveDb(imported);
  res.json({ ok:true, games: imported.games.length });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Critchell Game Collection running on port ${PORT}; data: ${DATA_FILE}`));
