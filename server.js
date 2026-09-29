const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'collection.json');

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
    version: 1,
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
    genres: Array.isArray(body.genres) ? body.genres.map(String).map(s=>s.trim()).filter(Boolean) : String(body.genres || '').split(',').map(s=>s.trim()).filter(Boolean),
    description: String(body.description || '').trim(),
    status: String(body.status || 'Backlog').trim(),
    favourite: Boolean(body.favourite),
    rating: Math.max(0, Math.min(10, Number(body.rating) || 0)),
    notes: String(body.notes || '').trim(),
    copies,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req,res) => res.json({ ok:true, dataDir: DATA_DIR, persistent: DATA_DIR === '/data' }));

app.get('/api/config', (req,res) => {
  const db = loadDb();
  res.json({ settings: db.settings, platformGroups: db.platformGroups, stores: db.stores, statuses: db.statuses });
});

app.get('/api/games', (req,res) => {
  const db = loadDb();
  res.json(db.games.sort((a,b) => (a.sortTitle || a.title).localeCompare(b.sortTitle || b.title)));
});

app.get('/api/games/:id', (req,res) => {
  const db = loadDb();
  const game = db.games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

app.post('/api/games', (req,res) => {
  const db = loadDb();
  const game = normalizeGame(req.body);
  if (!game.title) return res.status(400).json({ error: 'Title is required' });
  if (!game.copies.length) return res.status(400).json({ error: 'Add at least one owned copy/platform' });
  db.games.push(game);
  saveDb(db);
  res.status(201).json(game);
});

app.put('/api/games/:id', (req,res) => {
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

app.delete('/api/games/:id', (req,res) => {
  const db = loadDb();
  const before = db.games.length;
  db.games = db.games.filter(g => g.id !== req.params.id);
  if (db.games.length === before) return res.status(404).json({ error: 'Game not found' });
  saveDb(db);
  res.json({ ok:true });
});

app.get('/api/stats', (req,res) => {
  const db = loadDb();
  const copies = db.games.flatMap(g => g.copies || []);
  res.json({
    games: db.games.length,
    copies: copies.length,
    physical: copies.filter(c => c.type === 'Physical').length,
    digital: copies.filter(c => c.type === 'Digital').length,
    platforms: new Set(copies.map(c=>c.platform).filter(Boolean)).size,
    completed: db.games.filter(g => ['Completed','100% / Platinum'].includes(g.status)).length,
    favourites: db.games.filter(g => g.favourite).length
  });
});

app.get('/api/export', (req,res) => {
  const db = loadDb();
  res.setHeader('Content-Disposition', `attachment; filename="critchell-game-collection-${new Date().toISOString().slice(0,10)}.json"`);
  res.type('application/json').send(JSON.stringify(db, null, 2));
});

app.post('/api/import', (req,res) => {
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

app.get('*', (req,res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Critchell Game Collection running on port ${PORT}; data: ${DATA_FILE}`));
