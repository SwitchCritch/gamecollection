const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'collection.json');
const IGDB_CLIENT_ID = String(process.env.IGDB_CLIENT_ID || '').trim();
const IGDB_CLIENT_SECRET = String(process.env.IGDB_CLIENT_SECRET || '').trim();
const THEGAMESDB_API_KEY = String(process.env.THEGAMESDB_API_KEY || '').trim();
const STEAM_WEB_API_KEY = String(process.env.STEAM_WEB_API_KEY || '').trim();
const IGDB_BASE = 'https://api.igdb.com/v4';
const THEGAMESDB_BASE = 'https://api.thegamesdb.net';
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

function lookupProviders() {
  return [
    { id: 'igdb', name: 'IGDB', configured: Boolean(IGDB_CLIENT_ID && IGDB_CLIENT_SECRET), note: 'Best all-round source for PC and console games' },
    { id: 'thegamesdb', name: 'TheGamesDB', configured: Boolean(THEGAMESDB_API_KEY), note: 'Excellent for console and retro metadata/artwork' },
    { id: 'steam', name: 'Steam', configured: Boolean(STEAM_WEB_API_KEY), note: 'Official Steam catalogue search' }
  ];
}

function lookupConfigured() {
  return lookupProviders().some(p => p.configured);
}

function normaliseSearchText(v='') {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function searchScore(title, q) {
  const t = normaliseSearchText(title), n = normaliseSearchText(q);
  if (t === n) return 1000;
  if (t.startsWith(n)) return 700 - Math.min(200, t.length - n.length);
  if (t.includes(n)) return 500 - Math.min(200, t.indexOf(n));
  const parts = n.split(' ').filter(Boolean);
  return parts.reduce((score, part) => score + (t.includes(part) ? 40 : 0), 0);
}

// ----- IGDB -----
let igdbTokenCache = { token: '', expiresAt: 0 };
async function getIgdbToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) throw Object.assign(new Error('IGDB is not configured'), { status: 503 });
  if (igdbTokenCache.token && Date.now() < igdbTokenCache.expiresAt - 60000) return igdbTokenCache.token;
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', IGDB_CLIENT_ID);
  url.searchParams.set('client_secret', IGDB_CLIENT_SECRET);
  url.searchParams.set('grant_type', 'client_credentials');
  const response = await fetch(url, { method: 'POST', headers: { 'Accept': 'application/json' } });
  if (!response.ok) throw Object.assign(new Error(`IGDB authentication returned ${response.status}`), { status: response.status });
  const data = await response.json();
  igdbTokenCache = { token: data.access_token || '', expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3600)) * 1000 };
  return igdbTokenCache.token;
}

async function igdbFetch(endpoint, body) {
  const token = await getIgdbToken();
  const response = await fetch(`${IGDB_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': IGDB_CLIENT_ID, 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'text/plain' },
    body
  });
  if (!response.ok) throw Object.assign(new Error(`IGDB returned ${response.status}`), { status: response.status });
  return response.json();
}

function igdbCover(g={}) {
  return g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg` : '';
}
function isoFromUnix(ts) { return ts ? new Date(Number(ts) * 1000).toISOString().slice(0,10) : ''; }
function mapIgdbResult(g={}) {
  const releaseDate = isoFromUnix(g.first_release_date);
  return { provider:'IGDB', id:String(g.id||''), title:g.name||'', releaseDate, year:releaseDate.slice(0,4), cover:igdbCover(g), platforms:(g.platforms||[]).map(x=>x.name).filter(Boolean), genres:(g.genres||[]).map(x=>x.name).filter(Boolean), sourceUrl:g.url||'' };
}
async function searchIgdb(q) {
  const safe = String(q).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const fields = 'name,first_release_date,url,cover.image_id,genres.name,platforms.name';
  const rows = await igdbFetch('games', `search "${safe}"; fields ${fields}; where version_parent = null; limit 12;`);
  return rows.map(mapIgdbResult);
}
async function detailIgdb(id) {
  const fields = 'name,summary,storyline,first_release_date,url,cover.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher';
  const rows = await igdbFetch('games', `fields ${fields}; where id = ${Number(id)||0}; limit 1;`);
  const g = rows[0]; if (!g) throw Object.assign(new Error('Game not found in IGDB'), { status:404 });
  const companies=g.involved_companies||[];
  return { id:String(g.id), title:g.name||'', releaseDate:isoFromUnix(g.first_release_date), cover:igdbCover(g), developer:companies.filter(x=>x.developer).map(x=>x.company?.name).filter(Boolean).join(', '), publisher:companies.filter(x=>x.publisher).map(x=>x.company?.name).filter(Boolean).join(', '), genres:(g.genres||[]).map(x=>x.name).filter(Boolean), description:cleanLookupText(g.summary||g.storyline||''), platforms:(g.platforms||[]).map(x=>x.name).filter(Boolean), source:{provider:'IGDB',id:String(g.id),url:g.url||'https://www.igdb.com/'} };
}

// ----- TheGamesDB -----
const tgdbReferenceCache = new Map();
async function tgdbFetch(pathname, params={}) {
  const url = new URL(`${THEGAMESDB_BASE}${pathname}`);
  url.searchParams.set('apikey', THEGAMESDB_API_KEY);
  for (const [k,v] of Object.entries(params)) if (v!==undefined && v!==null && v!=='') url.searchParams.set(k,String(v));
  const response = await fetch(url, { headers:{'Accept':'application/json','User-Agent':'CritchellGameCollection/1.4'} });
  if (!response.ok) throw Object.assign(new Error(`TheGamesDB returned ${response.status}`), { status:response.status });
  return response.json();
}
function tgdbBoxart(data, id) {
  const box=data?.include?.boxart; const items=box?.data?.[String(id)]||box?.data?.[id]||[];
  const art=items.find(x=>x.type==='boxart' && x.side==='front') || items.find(x=>x.type==='boxart') || items[0];
  const base=box?.base_url?.large || box?.base_url?.original || box?.base_url?.medium || '';
  if (!art?.filename) return '';
  return /^https?:/i.test(art.filename) ? art.filename : `${base}${art.filename}`;
}
function tgdbPlatformName(data, game) {
  const map=data?.include?.platform?.data||{}; const p=map[String(game.platform)]||map[game.platform];
  return p?.name || '';
}
function mapTgdbResult(data, g={}) {
  const releaseDate=String(g.release_date||'').slice(0,10);
  const platform=tgdbPlatformName(data,g);
  return { provider:'TheGamesDB', id:String(g.id||''), title:g.game_title||g.title||'', releaseDate, year:releaseDate.slice(0,4), cover:tgdbBoxart(data,g.id), platforms:platform?[platform]:[], genres:[], sourceUrl:`https://thegamesdb.net/game.php?id=${g.id}` };
}
async function searchTgdb(q) {
  if (!THEGAMESDB_API_KEY) throw Object.assign(new Error('TheGamesDB is not configured'), {status:503});
  const data=await tgdbFetch('/v1.1/Games/ByGameName',{name:q,fields:'publishers,genres,overview,platform',include:'boxart,platform'});
  return (data?.data?.games||[]).slice(0,12).map(g=>mapTgdbResult(data,g));
}
async function tgdbRefMap(kind) {
  const cached=tgdbReferenceCache.get(kind); if (cached && Date.now()<cached.expiresAt) return cached.map;
  const endpoint={genres:'Genres',developers:'Developers',publishers:'Publishers'}[kind];
  const data=await tgdbFetch(`/v1/${endpoint}`);
  const raw=data?.data?.[kind]||{}; const map={};
  if (Array.isArray(raw)) raw.forEach(x=>map[String(x.id)]=x.name); else Object.values(raw).forEach(x=>map[String(x.id)]=x.name);
  tgdbReferenceCache.set(kind,{map,expiresAt:Date.now()+6*60*60*1000}); return map;
}
async function detailTgdb(id) {
  const data=await tgdbFetch('/v1/Games/ByGameID',{id,fields:'publishers,genres,overview,platform',include:'boxart,platform'});
  const g=(data?.data?.games||[])[0]; if(!g) throw Object.assign(new Error('Game not found in TheGamesDB'),{status:404});
  const [genres,developers,publishers]=await Promise.all([tgdbRefMap('genres'),tgdbRefMap('developers'),tgdbRefMap('publishers')]);
  const platform=tgdbPlatformName(data,g);
  return { id:String(g.id), title:g.game_title||'', releaseDate:String(g.release_date||'').slice(0,10), cover:tgdbBoxart(data,g.id), developer:(g.developers||[]).map(x=>developers[String(x)]).filter(Boolean).join(', '), publisher:(g.publishers||[]).map(x=>publishers[String(x)]).filter(Boolean).join(', '), genres:(g.genres||[]).map(x=>genres[String(x)]).filter(Boolean), description:cleanLookupText(g.overview||''), platforms:platform?[platform]:[], source:{provider:'TheGamesDB',id:String(g.id),url:`https://thegamesdb.net/game.php?id=${g.id}`} };
}

// ----- Steam -----
let steamAppCache={ apps:[], expiresAt:0 };
async function steamApps() {
  if (!STEAM_WEB_API_KEY) throw Object.assign(new Error('Steam is not configured'),{status:503});
  if (steamAppCache.apps.length && Date.now()<steamAppCache.expiresAt) return steamAppCache.apps;
  const url=new URL('https://partner.steam-api.com/IStoreService/GetAppList/v1/');
  url.searchParams.set('key',STEAM_WEB_API_KEY); url.searchParams.set('include_games','true'); url.searchParams.set('include_dlc','false'); url.searchParams.set('include_software','false'); url.searchParams.set('include_videos','false'); url.searchParams.set('include_hardware','false'); url.searchParams.set('max_results','50000');
  const response=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!response.ok) throw Object.assign(new Error(`Steam returned ${response.status}`),{status:response.status});
  const data=await response.json(); const apps=data?.response?.apps||data?.applist?.apps||[];
  steamAppCache={apps,expiresAt:Date.now()+12*60*60*1000}; return apps;
}
async function searchSteam(q) {
  const apps=await steamApps();
  return apps.map(a=>({...a,_score:searchScore(a.name||a.app_name||'',q)})).filter(a=>a._score>0).sort((a,b)=>b._score-a._score).slice(0,12).map(a=>{
    const id=String(a.appid||a.app_id||''); const title=a.name||a.app_name||'';
    return {provider:'Steam',id,title,releaseDate:'',year:'',cover:`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`,platforms:['PC'],genres:[],sourceUrl:`https://store.steampowered.com/app/${id}/`};
  });
}
async function detailSteam(id) {
  const apps=await steamApps(); const a=apps.find(x=>String(x.appid||x.app_id)===String(id)); if(!a) throw Object.assign(new Error('Game not found in Steam catalogue'),{status:404});
  const title=a.name||a.app_name||'';
  return {id:String(id),title,releaseDate:'',cover:`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900_2x.jpg`,developer:'',publisher:'',genres:[],description:'',platforms:['PC'],suggestedCopy:{platform:'Windows PC',type:'Digital',store:'Steam'},source:{provider:'Steam',id:String(id),url:`https://store.steampowered.com/app/${id}/`}};
}

async function searchProvider(provider,q) {
  if(provider==='igdb') return searchIgdb(q);
  if(provider==='thegamesdb') return searchTgdb(q);
  if(provider==='steam') return searchSteam(q);
  throw Object.assign(new Error('Unknown lookup provider'),{status:400});
}
async function detailProvider(provider,id) {
  if(provider==='igdb') return detailIgdb(id);
  if(provider==='thegamesdb') return detailTgdb(id);
  if(provider==='steam') return detailSteam(id);
  throw Object.assign(new Error('Unknown lookup provider'),{status:400});
}

app.get('/api/lookup/status', requireAdmin, (req,res)=>{
  const providers=lookupProviders();
  res.json({configured:providers.some(p=>p.configured),providers});
});

app.get('/api/lookup/search', requireAdmin, async (req,res)=>{
  const q=String(req.query.q||'').trim(); const requested=String(req.query.provider||'all').toLowerCase();
  if(!q) return res.status(400).json({error:'Enter a game title to search'});
  const providers=lookupProviders().filter(p=>p.configured && (requested==='all'||p.id===requested));
  if(!providers.length) return res.status(503).json({error:'No game lookup source is configured yet. Add IGDB, TheGamesDB or Steam credentials in Railway → Variables.'});
  const settled=await Promise.allSettled(providers.map(async p=>({provider:p.id,results:await searchProvider(p.id,q)})));
  const results=[]; const errors=[];
  for(const r of settled){ if(r.status==='fulfilled') results.push(...r.value.results); else errors.push(r.reason?.message||'Lookup failed'); }
  results.sort((a,b)=>searchScore(b.title,q)-searchScore(a.title,q));
  res.json({query:q,provider:requested,results:results.slice(0,30),errors});
});

app.get('/api/lookup/game/:provider/:id', requireAdmin, async (req,res)=>{
  const provider=String(req.params.provider||'').toLowerCase();
  const state=lookupProviders().find(p=>p.id===provider);
  if(!state?.configured) return res.status(503).json({error:`${state?.name||'That source'} is not configured.`});
  try { res.json(await detailProvider(provider,req.params.id)); }
  catch(err){ console.error(`${provider} detail failed:`,err); res.status(err.status===404?404:502).json({error:`Could not load that game from ${state.name} right now.`}); }
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
  res.json({ ok: true, dataDir: DATA_DIR, persistent: DATA_DIR === '/data', lookupConfigured: lookupConfigured(), lookupProviders: lookupProviders() });
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
