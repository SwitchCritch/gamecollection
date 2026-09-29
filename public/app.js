const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let config = null;
let games = [];
let stats = {};
let auth = { configured: false, authenticated: false, username: null };
let view = 'home';
let platformFilter = '';
let search = '';

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Something went wrong' }));
    const err = new Error(body.error || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return res.json();
};

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
}
function yearOf(g) { return g.releaseDate ? g.releaseDate.slice(0, 4) : ''; }
function copiesText(g) { return (g.copies || []).map(c => c.platform).join(' · '); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

async function refreshAuth() {
  auth = await api('/api/auth/status');
  updateAdminButton();
  return auth;
}

function updateAdminButton() {
  const btn = $('#adminBtn');
  if (!btn) return;
  if (auth.authenticated) {
    btn.textContent = 'ADMIN';
    btn.classList.add('logged-in');
  } else if (!auth.configured) {
    btn.textContent = 'SET UP ADMIN';
    btn.classList.remove('logged-in');
  } else {
    btn.textContent = 'ADMIN LOGIN';
    btn.classList.remove('logged-in');
  }
}

async function load() {
  [config, games, stats, auth] = await Promise.all([
    api('/api/config'),
    api('/api/games'),
    api('/api/stats'),
    api('/api/auth/status')
  ]);
  updateAdminButton();
  render();
}

function visibleGames() {
  let list = [...games];
  if (view === 'digital') list = list.filter(g => g.copies?.some(c => c.type === 'Digital'));
  if (view === 'physical') list = list.filter(g => g.copies?.some(c => c.type === 'Physical'));
  if (view === 'backlog') list = list.filter(g => ['Backlog', 'Unplayed'].includes(g.status));
  if (view === 'favourites') list = list.filter(g => g.favourite);
  if (platformFilter) list = list.filter(g => g.copies?.some(c => c.platform === platformFilter));
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(g => [g.title, g.developer, g.publisher, (g.genres || []).join(' '), copiesText(g)].join(' ').toLowerCase().includes(q));
  }
  return list;
}

function card(g) {
  const types = [...new Set((g.copies || []).map(c => c.type))];
  const platforms = [...new Set((g.copies || []).map(c => c.platform))];
  return `<article class="game-card" data-game="${g.id}">
    <div class="cover">
      ${g.cover ? `<img src="${esc(g.cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cover-fallback',textContent:${JSON.stringify(g.title)}}))">` : `<div class="cover-fallback">${esc(g.title)}</div>`}
      ${g.favourite ? '<div class="fav">★</div>' : ''}
    </div>
    <div class="game-info">
      <h3>${esc(g.title)}</h3>
      <div class="game-meta">${esc(platforms.slice(0, 2).join(' · '))}${platforms.length > 2 ? ` +${platforms.length - 2}` : ''}${yearOf(g) ? `<br>${yearOf(g)}` : ''}</div>
      <div class="badges">${types.map(t => `<span class="badge ${t.toLowerCase()}">${t}</span>`).join('')}<span class="badge">${(g.copies || []).length} ${(g.copies || []).length === 1 ? 'copy' : 'copies'}</span></div>
    </div>
  </article>`;
}

function homeView() {
  const list = visibleGames();
  const title = platformFilter ? platformFilter : view === 'home' ? 'My Game Collection' : ({ digital:'Digital Library', physical:'Physical Collection', backlog:'Backlog', favourites:'Favourites' }[view] || 'Collection');
  const adminAdd = auth.authenticated ? '<button class="primary" id="quickAdd">+ Add Game</button>' : '';
  const emptyText = auth.authenticated ? 'Add your first game or change the current filters.' : 'No games match the current view.';
  return `<section class="hero">
      <div><span class="eyebrow">PERSONAL GAMING ARCHIVE</span><h1>CRITCHELL <span>GAME COLLECTION</span></h1><p>Every physical and digital game in one place — across consoles, PC storefronts, editions and generations.</p></div>
      <div class="hero-card"><span>TOTAL OWNED COPIES</span><strong>${stats.copies || 0}</strong><span>across ${stats.platforms || 0} platforms</span></div>
    </section>
    <section class="stats">
      <div class="stat"><strong>${stats.games || 0}</strong><span>Unique Games</span></div>
      <div class="stat"><strong>${stats.physical || 0}</strong><span>Physical</span></div>
      <div class="stat"><strong>${stats.digital || 0}</strong><span>Digital</span></div>
      <div class="stat"><strong>${stats.platforms || 0}</strong><span>Platforms</span></div>
      <div class="stat"><strong>${stats.completed || 0}</strong><span>Completed</span></div>
      <div class="stat"><strong>${stats.favourites || 0}</strong><span>Favourites</span></div>
    </section>
    <div class="toolbar">
      <div class="search"><input id="searchBox" value="${esc(search)}" placeholder="Search title, platform, developer, publisher or genre…"></div>
      <select id="platformSelect" class="filter"><option value="">All platforms</option>${platformOptions(platformFilter, true)}</select>
      <select id="formatSelect" class="filter"><option value="">Current view</option><option value="home">All games</option><option value="physical">Physical</option><option value="digital">Digital</option><option value="backlog">Backlog</option><option value="favourites">Favourites</option></select>
    </div>
    <div class="section-head"><div><span class="eyebrow">LIBRARY</span><h2>${esc(title)}</h2><p>${list.length} ${list.length === 1 ? 'game' : 'games'} shown</p></div>${adminAdd}</div>
    ${list.length ? `<section class="game-grid">${list.map(card).join('')}</section>` : `<div class="empty"><strong>No games here yet</strong>${emptyText}</div>`}`;
}

function platformsView() {
  const counts = {};
  games.forEach(g => (g.copies || []).forEach(c => counts[c.platform] = (counts[c.platform] || 0) + 1));
  const cards = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([p, n]) => `<div class="platform-card" data-platform="${esc(p)}"><strong>${esc(p)}</strong><span>${n}</span></div>`).join('');
  return `<section class="hero"><div><span class="eyebrow">BROWSE BY SYSTEM</span><h1>YOUR <span>PLATFORMS</span></h1><p>Select a console or computer platform to see every copy you own for that system.</p></div></section><div class="section-head"><div><h2>${Object.keys(counts).length} platforms in your collection</h2></div></div>${cards ? `<section class="platform-grid">${cards}</section>` : `<div class="empty"><strong>No platforms yet</strong>They'll appear automatically when games are added.</div>`}`;
}

function render() {
  $('#app').innerHTML = view === 'platforms' ? platformsView() : homeView();
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  bindPage();
  updateAdminButton();
}

function bindPage() {
  $('#searchBox')?.addEventListener('input', e => { search = e.target.value; render(); });
  $('#platformSelect')?.addEventListener('change', e => { platformFilter = e.target.value; render(); });
  $('#formatSelect')?.addEventListener('change', e => { if (e.target.value) { view = e.target.value; platformFilter = ''; render(); } });
  $('#quickAdd')?.addEventListener('click', () => openForm());
  $$('[data-game]').forEach(el => el.addEventListener('click', () => openDetail(el.dataset.game)));
  $$('[data-platform]').forEach(el => el.addEventListener('click', () => { platformFilter = el.dataset.platform; view = 'home'; render(); }));
}

$$('[data-view]').forEach(btn => btn.addEventListener('click', () => { view = btn.dataset.view; platformFilter = ''; search = ''; render(); }));
$('#adminBtn').addEventListener('click', handleAdminButton);
$$('[data-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog').close()));

async function handleAdminButton() {
  try {
    await refreshAuth();
    if (auth.authenticated) openAdmin();
    else openAuth();
  } catch (err) {
    alert(err.message);
  }
}

function openAuth() {
  const configured = auth.configured;
  $('#authTitle').textContent = configured ? 'Admin login' : 'Admin setup required';
  $('#authHeading').textContent = configured ? 'Collection management is protected' : 'Set your private admin credentials in Railway';
  $('#authText').innerHTML = configured
    ? 'Log in to add, search, edit, import or delete games.'
    : '<strong>There is no admin account configured on the server yet.</strong><br><br>In <strong>Railway → your service → Variables</strong>, add <code>ADMIN_USERNAME</code> and <code>ADMIN_PASSWORD</code>, then redeploy. Do not type your new password into this screen until the site reports that admin login is configured.';
  $('#authUsernameWrap').hidden = !configured;
  $('#authPasswordWrap').hidden = !configured;
  $('#authConfirmWrap').hidden = true;
  $('#authConfirmPassword').required = false;
  $('#authSubmit').hidden = !configured;
  $('#authRecheck').hidden = configured;
  $('#authSubmit').textContent = 'Log in';
  $('#authMessage').textContent = configured ? '' : 'Waiting for Railway admin variables.';
  $('#authMessage').classList.remove('error');
  $('#authUsername').value = '';
  $('#authPassword').value = '';
  $('#authDialog').showModal();
  if (configured) setTimeout(() => $('#authUsername').focus(), 50);
}

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth.configured) {
    $('#authMessage').textContent = 'Admin login is not configured yet. Add ADMIN_USERNAME and ADMIN_PASSWORD in Railway first.';
    $('#authMessage').classList.add('error');
    return;
  }
  const username = $('#authUsername').value.trim();
  const password = $('#authPassword').value;
  $('#authMessage').classList.remove('error');
  $('#authMessage').textContent = 'Logging in…';
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    await refreshAuth();
    $('#authDialog').close();
    render();
    toast('Logged in');
    await openAdmin();
  } catch (err) {
    $('#authMessage').textContent = err.message;
    $('#authMessage').classList.add('error');
  }
});


$('#authRecheck').addEventListener('click', async () => {
  const btn = $('#authRecheck');
  btn.disabled = true;
  $('#authMessage').classList.remove('error');
  $('#authMessage').textContent = 'Checking Railway configuration…';
  try {
    await refreshAuth();
    if (auth.configured) {
      $('#authDialog').close();
      openAuth();
      toast('Admin login is ready');
    } else {
      $('#authMessage').textContent = 'Still not configured. Make sure both Railway variables exist and the latest deployment has finished.';
      $('#authMessage').classList.add('error');
    }
  } catch (err) {
    $('#authMessage').textContent = err.message;
    $('#authMessage').classList.add('error');
  } finally {
    btn.disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    auth = { configured: true, authenticated: false, username: null };
    $('#adminDialog').close();
    render();
    toast('Logged out');
  } catch (err) {
    alert(err.message);
  }
});

function platformOptions(selected = '', grouped = false) {
  let html = '';
  for (const [group, items] of Object.entries(config.platformGroups || {})) {
    const opts = items.map(p => `<option ${p === selected ? 'selected' : ''}>${esc(p)}</option>`).join('');
    html += grouped ? `<optgroup label="${esc(group)}">${opts}</optgroup>` : opts;
  }
  return html;
}
function storeOptions(selected = '') {
  return (config.stores || []).map(s => `<option ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');
}

function addCopy(copy = {}) {
  const node = $('#copyTemplate').content.cloneNode(true);
  const card = node.querySelector('.copy-card');
  card.querySelector('.copy-platform').innerHTML = '<option value="">Select platform…</option>' + platformOptions(copy.platform);
  card.querySelector('.copy-store').innerHTML = '<option value="">Select store…</option>' + storeOptions(copy.store);
  card.querySelector('.copy-type').value = copy.type || 'Physical';
  card.querySelector('.copy-edition').value = copy.edition || 'Standard';
  card.querySelector('.copy-region').value = copy.region || '';
  card.querySelector('.copy-notes').value = copy.notes || '';
  card.querySelector('.copy-box').checked = !!copy.box;
  card.querySelector('.copy-manual').checked = !!copy.manual;
  card.querySelector('.copy-media').checked = copy.media !== false;
  card.querySelector('.copy-steelbook').checked = !!copy.steelbook;
  const sync = () => {
    const digital = card.querySelector('.copy-type').value === 'Digital';
    card.querySelector('.store-field').style.opacity = digital ? 1 : .35;
    card.querySelector('.copy-store').disabled = !digital;
    card.querySelector('.physical-options').style.display = digital ? 'none' : 'flex';
  };
  card.querySelector('.copy-type').addEventListener('change', sync);
  card.querySelector('.remove-copy').addEventListener('click', () => {
    card.remove();
    if (!$('#copies').children.length) addCopy();
  });
  sync();
  $('#copies').appendChild(node);
}

function lookupResultCard(g) {
  const platforms = (g.platforms || []).slice(0, 5).join(' · ');
  return `<button type="button" class="lookup-result" data-lookup-id="${esc(g.id)}" data-lookup-provider="${esc(String(g.provider || '').toLowerCase())}">
    <div>${g.cover ? `<img src="${esc(g.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '<div class="lookup-cover-fallback">NO COVER</div>'}</div>
    <div>
      <span class="provider-chip">${esc(g.provider || 'Game database')}</span>
      <strong>${esc(g.title)}</strong>
      <small>${esc(g.year || 'Release date unknown')}${g.genres?.length ? ' · ' + esc(g.genres.slice(0, 2).join(', ')) : ''}</small>
      <small>${esc(platforms || 'Platform information unavailable')}${(g.platforms || []).length > 5 ? ' …' : ''}</small>
      <span class="lookup-question">Do you mean this one?</span>
      <span class="choose">SELECT THIS GAME →</span>
    </div>
  </button>`;
}

async function updateLookupStatus(game = null) {
  $('#lookupResults').innerHTML = '';
  try {
    const state = await api('/api/lookup/status');
    const providers = state.providers || [];
    const select = $('#lookupProvider');
    select.innerHTML = '<option value="all">Search all available sources</option>' + providers.map(p => `<option value="${esc(p.id)}" ${p.configured ? '' : 'disabled'}>${esc(p.name)}${p.configured ? '' : ' — not configured'}</option>`).join('');
    const ready = providers.filter(p => p.configured).map(p => p.name);
    if (state.configured) {
      $('#lookupMessage').classList.remove('error');
      $('#lookupMessage').innerHTML = game?.source?.provider
        ? `Currently linked to <strong>${esc(game.source.provider)}</strong>. Available lookup sources: <strong>${esc(ready.join(', '))}</strong>.`
        : `<strong>Automatic lookup is ready.</strong> Searching: ${esc(ready.join(', '))}.`;
      $('#lookupBtn').disabled = false;
    } else {
      $('#lookupMessage').classList.add('error');
      $('#lookupMessage').innerHTML = '<strong>No lookup source is configured yet.</strong> Add IGDB, TheGamesDB or Steam credentials in Railway → Variables. Manual entry still works.';
      $('#lookupBtn').disabled = true;
    }
  } catch (err) {
    $('#lookupMessage').textContent = err.message;
    $('#lookupMessage').classList.add('error');
    $('#lookupBtn').disabled = true;
  }
}

async function searchGameLookup() {
  const q = $('#lookupQuery').value.trim();
  const provider = $('#lookupProvider').value || 'all';
  if (!q) {
    $('#lookupMessage').textContent = 'Type a game title first.';
    $('#lookupMessage').classList.add('error');
    return;
  }
  $('#lookupBtn').disabled = true;
  $('#lookupResults').innerHTML = '<div class="lookup-loading">Searching game databases…</div>';
  $('#lookupMessage').textContent = `Looking for “${q}”…`;
  $('#lookupMessage').classList.remove('error');
  try {
    const data = await api('/api/lookup/search?q=' + encodeURIComponent(q) + '&provider=' + encodeURIComponent(provider));
    const results = data.results || [];
    $('#lookupMessage').innerHTML = results.length
      ? `<strong>I found ${results.length} possible ${results.length === 1 ? 'match' : 'matches'}.</strong> Do you mean one of these?${data.errors?.length ? ' <small>One source was temporarily unavailable.</small>' : ''}`
      : 'No matches found. Try a slightly different title, another source, or enter the details manually.';
    $('#lookupResults').innerHTML = results.map(lookupResultCard).join('');
    $$('#lookupResults [data-lookup-id]').forEach(btn => btn.addEventListener('click', () => selectLookupGame(btn.dataset.lookupProvider, btn.dataset.lookupId)));
  } catch (err) {
    $('#lookupResults').innerHTML = '';
    $('#lookupMessage').textContent = err.message;
    $('#lookupMessage').classList.add('error');
    if (err.status === 401) {
      $('#gameDialog').close();
      await refreshAuth();
      openAuth();
    }
  } finally {
    if (auth.authenticated) $('#lookupBtn').disabled = false;
  }
}

async function selectLookupGame(provider, id) {
  $('#lookupMessage').textContent = 'Loading the full game details…';
  $('#lookupMessage').classList.remove('error');
  try {
    const g = await api('/api/lookup/game/' + encodeURIComponent(provider) + '/' + encodeURIComponent(id));
    $('#title').value = g.title || '';
    $('#releaseDate').value = g.releaseDate || '';
    $('#developer').value = g.developer || '';
    $('#publisher').value = g.publisher || '';
    $('#genres').value = (g.genres || []).join(', ');
    $('#cover').value = g.cover || '';
    $('#description').value = g.description || '';
    $('#sourceProvider').value = g.source?.provider || provider;
    $('#sourceId').value = g.source?.id || String(id);
    $('#sourceUrl').value = g.source?.url || '';
    $('#lookupQuery').value = g.title || $('#lookupQuery').value;
    $('#lookupResults').innerHTML = '';
    $('#lookupMessage').innerHTML = `✓ <strong>${esc(g.title)}</strong> selected from <strong>${esc(g.source?.provider || provider)}</strong>. I filled in the available information below.`;
    suggestPlatformForCopy(g.platforms || []);
    if (g.suggestedCopy) applySuggestedCopy(g.suggestedCopy);
  } catch (err) {
    $('#lookupMessage').textContent = err.message;
    $('#lookupMessage').classList.add('error');
  }
}

function applySuggestedCopy(copy = {}) {
  const card = $('#copies .copy-card');
  if (!card) return;
  if (copy.platform) {
    const sel = card.querySelector('.copy-platform');
    if ([...sel.options].some(o => o.value === copy.platform)) sel.value = copy.platform;
  }
  if (copy.type) {
    card.querySelector('.copy-type').value = copy.type;
    card.querySelector('.copy-type').dispatchEvent(new Event('change'));
  }
  if (copy.store) {
    const sel = card.querySelector('.copy-store');
    if ([...sel.options].some(o => o.value === copy.store)) sel.value = copy.store;
  }
}

function normalizedPlatformMatch(raw = '') {
  const n = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {
    'pc':'Windows PC',
    'playstation':'PlayStation', 'playstation 2':'PlayStation 2', 'playstation 3':'PlayStation 3', 'playstation 4':'PlayStation 4', 'playstation 5':'PlayStation 5',
    'psp':'PSP', 'ps vita':'PlayStation Vita',
    'xbox':'Xbox', 'xbox 360':'Xbox 360', 'xbox one':'Xbox One', 'xbox series s x':'Xbox Series X/S', 'xbox series x s':'Xbox Series X/S',
    'nintendo switch':'Nintendo Switch', 'nintendo switch 2':'Nintendo Switch 2', 'wii':'Nintendo Wii', 'wii u':'Nintendo Wii U', 'gamecube':'Nintendo GameCube', 'nintendo gamecube':'Nintendo GameCube', 'nintendo 64':'Nintendo 64',
    'game boy':'Game Boy', 'game boy color':'Game Boy Color', 'game boy advance':'Game Boy Advance', 'nintendo ds':'Nintendo DS', 'nintendo 3ds':'Nintendo 3DS',
    'dreamcast':'Dreamcast', 'sega saturn':'Saturn', 'genesis':'Mega Drive / Genesis', 'sega genesis':'Mega Drive / Genesis'
  };
  return aliases[n] || '';
}

function suggestPlatformForCopy(platforms = []) {
  const select = $('#copies .copy-platform');
  if (!select || select.value) return;
  for (const p of platforms) {
    const mapped = normalizedPlatformMatch(p);
    if (mapped && [...select.options].some(o => o.value === mapped)) {
      select.value = mapped;
      break;
    }
  }
}

$('#lookupBtn').addEventListener('click', searchGameLookup);
$('#lookupQuery').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchGameLookup();
  }
});

function openForm(game = null) {
  if (!auth.authenticated) {
    openAuth();
    return;
  }
  $('#formTitle').textContent = game ? 'Edit game' : 'Add game';
  $('#gameId').value = game?.id || '';
  $('#title').value = game?.title || '';
  $('#releaseDate').value = game?.releaseDate || '';
  $('#developer').value = game?.developer || '';
  $('#publisher').value = game?.publisher || '';
  $('#genres').value = (game?.genres || []).join(', ');
  $('#cover').value = game?.cover || '';
  $('#rating').value = game?.rating || '';
  $('#favourite').checked = !!game?.favourite;
  $('#description').value = game?.description || '';
  $('#notes').value = game?.notes || '';
  $('#sourceProvider').value = game?.source?.provider || '';
  $('#sourceId').value = game?.source?.id || '';
  $('#sourceUrl').value = game?.source?.url || '';
  $('#lookupQuery').value = game?.title || '';
  $('#status').innerHTML = (config.statuses || []).map(s => `<option ${s === (game?.status || 'Backlog') ? 'selected' : ''}>${esc(s)}</option>`).join('');
  $('#copies').innerHTML = '';
  (game?.copies?.length ? game.copies : [{}]).forEach(addCopy);
  $('#gameDialog').showModal();
  updateLookupStatus(game);
  if (!game) setTimeout(() => $('#lookupQuery').focus(), 80);
}

$('#addCopyBtn').addEventListener('click', () => addCopy());
$('#gameForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const copies = $$('#copies .copy-card').map(card => ({
      platform: card.querySelector('.copy-platform').value,
      type: card.querySelector('.copy-type').value,
      store: card.querySelector('.copy-store').value,
      edition: card.querySelector('.copy-edition').value,
      region: card.querySelector('.copy-region').value,
      notes: card.querySelector('.copy-notes').value,
      box: card.querySelector('.copy-box').checked,
      manual: card.querySelector('.copy-manual').checked,
      media: card.querySelector('.copy-media').checked,
      steelbook: card.querySelector('.copy-steelbook').checked
    }));
    const source = $('#sourceProvider').value ? { provider: $('#sourceProvider').value, id: $('#sourceId').value, url: $('#sourceUrl').value } : null;
    const body = {
      title: $('#title').value,
      releaseDate: $('#releaseDate').value,
      developer: $('#developer').value,
      publisher: $('#publisher').value,
      genres: $('#genres').value,
      cover: $('#cover').value,
      rating: $('#rating').value,
      favourite: $('#favourite').checked,
      description: $('#description').value,
      notes: $('#notes').value,
      status: $('#status').value,
      copies,
      source
    };
    const id = $('#gameId').value;
    await api(id ? `/api/games/${id}` : '/api/games', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    $('#gameDialog').close();
    toast(id ? 'Game updated' : 'Game added');
    await load();
  } catch (err) {
    if (err.status === 401) {
      $('#gameDialog').close();
      await refreshAuth();
      openAuth();
    } else {
      alert(err.message);
    }
  }
});

function openDetail(id) {
  const g = games.find(x => x.id === id);
  if (!g) return;
  const copies = (g.copies || []).map(c => `<div class="owned-copy"><strong>${esc(c.platform)} · ${esc(c.type)}</strong><span class="badge ${c.type.toLowerCase()}">${esc(c.type)}</span>${c.store ? ` <span class="badge">${esc(c.store)}</span>` : ''}${c.edition ? ` <span class="badge">${esc(c.edition)}</span>` : ''}${c.region ? ` <span class="badge">${esc(c.region)}</span>` : ''}<div class="game-meta">${c.notes ? esc(c.notes) : ''}</div></div>`).join('');
  $('#detailDialog').innerHTML = `<div class="modal-head"><div><span class="eyebrow">GAME DETAILS</span></div><button class="icon-btn" onclick="document.getElementById('detailDialog').close()">×</button></div><div class="detail"><div class="detail-cover">${g.cover ? `<img src="${esc(g.cover)}" alt="${esc(g.title)}">` : `<div class="cover-fallback">${esc(g.title)}</div>`}</div><div class="detail-body"><span class="eyebrow">${g.favourite ? '★ FAVOURITE' : 'IN COLLECTION'}</span><h2>${esc(g.title)}</h2><div class="badges"><span class="badge">${esc(g.status)}</span>${g.rating ? `<span class="badge">${g.rating}/10</span>` : ''}${(g.genres || []).map(x => `<span class="badge">${esc(x)}</span>`).join('')}</div><div class="detail-facts"><div class="fact"><small>Developer</small>${esc(g.developer || '—')}</div><div class="fact"><small>Publisher</small>${esc(g.publisher || '—')}</div><div class="fact"><small>Release</small>${esc(g.releaseDate || '—')}</div><div class="fact"><small>Owned copies</small>${g.copies?.length || 0}</div></div>${g.description ? `<p class="detail-desc">${esc(g.description)}</p>` : ''}<span class="eyebrow">IN MY COLLECTION</span>${copies}${g.notes ? `<p class="detail-desc"><strong>Notes:</strong><br>${esc(g.notes)}</p>` : ''}</div></div>`;
  $('#detailDialog').showModal();
}

async function openAdmin() {
  try {
    await refreshAuth();
    if (!auth.authenticated) {
      openAuth();
      return;
    }
    const health = await api('/api/health');
    $('#adminSessionText').textContent = `Logged in as ${auth.username}`;
    $('#storageStatus').innerHTML = `${health.persistent ? '✓ Persistent Railway storage detected at <strong>/data</strong>. Your collection and admin login survive redeploys.' : '⚠ Running with local project storage. On Railway, mount a Volume at <strong>/data</strong> for persistence.'}<br>${health.lookupConfigured ? '✓ Game lookup is configured: <strong>' + (health.lookupProviders || []).filter(p => p.configured).map(p => p.name).join(', ') + '</strong>.' : '⚠ Automatic lookup is OFF. Configure IGDB, TheGamesDB or Steam credentials in Railway → Variables.'}`;
    $('#adminRows').innerHTML = games.map(g => `<tr><td><strong>${esc(g.title)}</strong><div class="game-meta">${esc(copiesText(g))}</div></td><td>${g.copies?.length || 0}</td><td>${esc(g.status)}</td><td><div class="row-actions"><button class="tiny edit-game" data-id="${g.id}">Edit</button><button class="tiny danger delete-game" data-id="${g.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4">No games added yet.</td></tr>';
    $$('.edit-game').forEach(b => b.addEventListener('click', () => { $('#adminDialog').close(); openForm(games.find(g => g.id === b.dataset.id)); }));
    $$('.delete-game').forEach(b => b.addEventListener('click', async () => {
      const g = games.find(x => x.id === b.dataset.id);
      if (!confirm(`Delete ${g.title}?`)) return;
      try {
        await api('/api/games/' + b.dataset.id, { method: 'DELETE' });
        toast('Game deleted');
        await load();
        await openAdmin();
      } catch (err) {
        alert(err.message);
      }
    }));
    $('#adminDialog').showModal();
  } catch (err) {
    if (err.status === 401) {
      auth.authenticated = false;
      render();
      openAuth();
    } else {
      alert(err.message);
    }
  }
}

$('#adminAdd').addEventListener('click', () => { $('#adminDialog').close(); openForm(); });

async function enrichMissingMetadata() {
  const candidates = games.filter(g => !g.cover || !g.releaseDate || !g.developer || !g.publisher || !(g.genres || []).length || !g.description);
  if (!candidates.length) { alert('All games already have metadata.'); return; }
  if (!confirm(`Auto-fill missing metadata for ${candidates.length} game(s)?\n\nThis uses your configured game database and keeps any information you already entered.`)) return;
  const box = $('#enrichProgress');
  const btn = $('#enrichMissing');
  btn.disabled = true;
  box.hidden = false;
  let done = 0, updated = 0, skipped = 0;
  for (const g of candidates) {
    box.innerHTML = `<strong>${done} / ${candidates.length}</strong> — Looking up ${esc(g.title)}<progress max="${candidates.length}" value="${done}"></progress><br>${updated} updated · ${skipped} skipped`;
    try {
      await api('/api/games/' + encodeURIComponent(g.id) + '/enrich', { method:'POST', body:'{}' });
      updated++;
    } catch (err) {
      skipped++;
    }
    done++;
    // Small delay is kinder to free API tiers and helps avoid rate limits.
    await new Promise(r => setTimeout(r, 180));
  }
  box.innerHTML = `<strong>Finished</strong><progress max="${candidates.length}" value="${candidates.length}"></progress><br>${updated} updated · ${skipped} skipped`;
  btn.disabled = false;
  await load();
  alert(`Metadata lookup finished.\n\n${updated} updated\n${skipped} skipped/no confident match`);
}

$('#enrichMissing').addEventListener('click', enrichMissingMetadata);


$('#mergeImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const count = Array.isArray(data.games) ? data.games.length : 0;
    if (!count) throw new Error('This file does not contain any games.');
    if (!confirm(`Add/merge ${count} games into your current collection? Existing games will NOT be deleted.`)) return;
    const result = await api('/api/import/merge', { method: 'POST', body: JSON.stringify(data) });
    const parts = [
      `${result.addedGames} new game${result.addedGames === 1 ? '' : 's'} added`,
      `${result.addedCopies} owned cop${result.addedCopies === 1 ? 'y' : 'ies'} added`
    ];
    if (result.skippedDuplicateCopies) parts.push(`${result.skippedDuplicateCopies} duplicate cop${result.skippedDuplicateCopies === 1 ? 'y' : 'ies'} skipped`);
    toast('Import complete');
    alert(`Import complete.\n\n${parts.join('\n')}`);
    $('#adminDialog').close();
    await load();
  } catch (err) {
    alert('Could not merge games: ' + err.message);
  }
  e.target.value = '';
});

$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm(`RESTORE FULL BACKUP? It contains ${data.games?.length || 0} games and will REPLACE the current collection. Use Import Games (Merge) if you only want to add games.`)) return;
    await api('/api/import', { method: 'POST', body: JSON.stringify(data) });
    toast('Full backup restored');
    $('#adminDialog').close();
    await load();
  } catch (err) {
    alert('Could not import backup: ' + err.message);
  }
  e.target.value = '';
});

load().catch(err => {
  $('#app').innerHTML = `<div class="empty"><strong>Could not load collection</strong>${esc(err.message)}</div>`;
});
