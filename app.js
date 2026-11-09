'use strict';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// localStorage can throw (private mode, full disk); the launcher must still work.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  json(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
};
const KEY = { bar: 'shanoware.bar', player: 'shanoware.player', welcomed: 'shanoware.welcomed', last: 'shanoware.last', newsRead: 'shanoware.newsRead', settings: 'shanoware.settings', errors: 'shanoware.errors',
  sync: 'shanoware.sync', acct: 'shanoware.acct', ageBlocked: 'shanoware.ageBlocked', pendingDelete: 'shanoware.pendingDelete', linkSends: 'shanoware.linkSends' };

// The app used to be called Save Point. Copy its keys across once, then remove the old ones.
for (const [from, to] of [['savepoint.bar', KEY.bar]]) {
  const v = store.get(from);
  if (v !== null) { if (store.get(to) === null) store.set(to, v); if (store.get(to) !== null) store.del(from); }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // all user and file text goes in as plain text
  return n;
}
// Pixelify Sans digits read ambiguously (5/S, 2/8) at small sizes, so numbers use Silkscreen.
function withNums(cls, text) {
  const n = el('span', cls);
  String(text).split(/(\d+)/).forEach((part, i) => n.append(i % 2 ? el('span', 'num', part) : part));
  return n;
}
function icon(name, cls = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}
function button(cls, text, onClick) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function stateBox(mark, title, text, action) {
  const s = el('div', 'state');
  s.append(el('span', 'state-mark', mark), el('strong', null, title), el('p', null, text));
  if (action) s.append(action);
  return s;
}
function withTransition(fn) {
  if (document.startViewTransition && !reduced.matches) document.startViewTransition(fn);
  else fn();
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------- Tabs: built from every <section data-tab> ---------- */
const sections = [...document.querySelectorAll('[data-tab]')];
const tabbar = $('tabbar');
const tabBtns = sections.map(sec => {
  const id = sec.dataset.tab;
  const b = button('tabbtn', null, () => showTab(id));
  b.id = 'tab-' + id;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-controls', 'panel-' + id);
  if (document.getElementById('i-' + id)) b.append(icon(id));
  b.append(el('span', null, sec.dataset.label));
  sec.id = 'panel-' + id;
  sec.setAttribute('role', 'tabpanel');
  sec.setAttribute('aria-labelledby', b.id);
  tabbar.append(b);
  return b;
});
function showTab(id) {
  sections.forEach((sec, i) => {
    const on = sec.dataset.tab === id;
    sec.hidden = !on;
    tabBtns[i].setAttribute('aria-selected', on);
    tabBtns[i].tabIndex = on ? 0 : -1;
  });
}
tabbar.addEventListener('keydown', e => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const i = (tabBtns.indexOf(document.activeElement) + step + tabBtns.length) % tabBtns.length;
  tabBtns[i].focus();
  tabBtns[i].click();
});
showTab('home');

/* ---------- Tab bar position (Settings and welcome) ---------- */
const SIDES = ['top', 'right', 'bottom', 'left'];
[['settings-bar', 'bar-s'], ['welcome-bar', 'bar-w']].forEach(([host, name]) => {
  const picker = $('bar-picker').content.cloneNode(true);
  picker.querySelectorAll('input').forEach(r => {
    r.name = name;
    r.addEventListener('change', () => setBar(r.value, true));
  });
  $(host).append(picker);
});
function setBar(side, animate) {
  if (!SIDES.includes(side)) side = 'left';
  const apply = () => { document.body.dataset.bar = side; };
  animate ? withTransition(apply) : apply();
  if (animate) store.set(KEY.bar, side); // only a player's choice is stored
  document.querySelectorAll(`.cross input[value="${side}"]`).forEach(r => { r.checked = true; });
}
setBar(store.get(KEY.bar), false);

/* ---------- Player name ---------- */
function cleanName(raw) {
  // Strip control characters and squeeze spaces; the name is only ever shown as plain text.
  return String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
function playerName() { return cleanName(store.json(KEY.player)?.name); }
function saveName(input, errEl) {
  const name = cleanName(input.value);
  input.setAttribute('aria-invalid', !name);
  errEl.textContent = name ? '' : 'Enter a name. A short nickname is fine.';
  if (!name) { input.focus(); return false; }
  store.set(KEY.player, JSON.stringify({ ...(store.json(KEY.player) || {}), name }));
  input.value = name;
  renderGreeting();
  pushProfile({ name });
  return true;
}
$('name-form').addEventListener('submit', e => {
  e.preventDefault();
  if (saveName($('name-input'), $('name-err'))) toast('Name saved');
});

/* ---------- Games and saves ---------- */
let games = [], gamesState = 'loading';

function validGame(g) {
  return g && typeof g.id === 'string' && typeof g.title === 'string' && typeof g.path === 'string';
}
function paint(node, g) {
  const p = g.palette || {};
  node.style.setProperty('--g-bg', p.background || '#111');
  node.style.setProperty('--g-fg', p.text || '#eee');
  node.style.setProperty('--g-accent', p.accent || '#fff');
  node.style.setProperty('--g-font', `"${String(g.font || 'Silkscreen').replace(/"/g, '')}", "Silkscreen", monospace`);
}
// A game's old single save (legacyKey) becomes Save 1; removed only once copied.
function migrateLegacy(g) {
  const old = g.legacyKey && store.get(g.legacyKey), first = (g.saveKey || g.id + '.slot') + 1;
  if (old != null && store.get(first) === null) { store.set(first, old); if (store.get(first) === old) store.del(g.legacyKey); }
}
// Slot n lives at saveKey+n; the game writes a summary beside it at saveKey+n+".meta":
// {"progress": [["Endings", 3, 18], ...], "totals": {"Runs": 4}, "updated": <ms>}
function readSlots(g) {
  const count = Math.max(1, Math.min(9, g.slots | 0 || 3));
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1, key = (g.saveKey || g.id + '.slot') + n;
    const meta = store.json(key + '.meta');
    return { n, key, used: store.get(key) !== null, meta: meta && typeof meta === 'object' ? meta : null };
  });
}
function progressParts(meta) {
  return (Array.isArray(meta?.progress) ? meta.progress : [])
    .filter(p => Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1]))
    .map(([label, have, total]) => {
      const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : null;
      return { label: label.slice(0, 16), have: Math.max(0, Math.min(Math.floor(have), t ?? Infinity)), total: t };
    });
}
function progressText(meta) {
  return progressParts(meta).map(p => p.total ? `${p.label} ${p.have}/${p.total}` : `${p.label} ${p.have}`).join(' · ');
}
// Segmented pixel meters, one segment per item up to 24.
function meters(meta) {
  const box = el('div', 'meters');
  for (const p of progressParts(meta)) {
    const row = el('div');
    const top = el('div', 'meter-top');
    top.append(el('span', null, p.label), el('span', 'num', p.total ? `${p.have}/${p.total}` : String(p.have)));
    row.append(top);
    if (p.total) {
      const segs = Math.min(p.total, 24), lit = Math.round(Math.min(p.have, p.total) / p.total * segs);
      const bar = el('div', 'meter');
      bar.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < segs; i++) bar.append(el('i', i < lit ? 'on' : null));
      row.append(bar);
    }
    box.append(row);
  }
  return box;
}
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(ms) {
  if (typeof ms !== 'number') return '';
  let d = (ms - Date.now()) / 1000;
  for (const [unit, size] of [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]]) {
    if (Math.abs(d) < size) return 'Played ' + rtf.format(Math.round(d), unit);
    d /= size;
  }
}

let leaving = false; // one tap opens one game; a double tap must not start two saves
function play(g, n) {
  if (leaving) return;
  leaving = true;
  store.set(KEY.last, JSON.stringify({ id: g.id, slot: n }));
  location.href = `${g.path}?slot=${n}`;
}

/* ---------- Home ---------- */
function renderGreeting() {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = playerName(), g = $('greet');
  const av = allAvatars().find(a => a.key === store.json(KEY.player)?.avatar), img = $('home-avatar');
  img.hidden = !av;
  if (av) { img.src = av.src; img.alt = av.name; }
  g.replaceChildren(hello);
  if (name) g.append(', ', el('b', null, name));
}

// The most recently saved game across everything; falls back to the last one launched.
function lastPlayed() {
  let best = null;
  for (const g of games) for (const s of readSlots(g)) {
    if (s.used && typeof s.meta?.updated === 'number' && (!best || s.meta.updated > best.s.meta.updated)) best = { g, s };
  }
  if (best) return best;
  const last = store.json(KEY.last), g = games.find(x => x.id === last?.id);
  const s = g && readSlots(g).find(x => x.n === last.slot && x.used);
  if (s) return { g, s };
  // A save carried over from before has no play time yet; still offer it.
  for (const g of games) { const s = readSlots(g).find(x => x.used); if (s) return { g, s }; }
  return null;
}

function renderContinue() {
  const host = $('continue');
  if (gamesState === 'loading') { host.replaceChildren(el('div', 'skeleton')); return; }
  const pick = gamesState === 'ok' && lastPlayed();
  if (!pick) {
    const box = el('div', 'cart-empty');
    box.append(el('strong', null, 'Nothing in the slot yet'),
      el('p', null, gamesState === 'error' ? "Your games couldn't load. Open the Library to try again." : 'Pick a game from the Library and your last save will wait for you here.'),
      button('btn btn-brand', 'Open Library', () => showTab('library')));
    host.replaceChildren(box);
    return;
  }
  const { g, s } = pick;
  const wrap = el('div', 'cart-wrap'), cart = el('article', 'cart');
  paint(cart, g);
  cart.setAttribute('aria-label', `Continue ${g.title}, save ${s.n}`);
  const label = el('div', 'cart-label');
  label.append(el('h2', 'cart-title', g.title), el('span', 'cart-slot', `Save ${s.n}`));
  const win = el('div', 'cart-window'), art = el('div', 'cart-art');
  if (g.art) { const img = el('img'); img.src = g.art; img.alt = ''; img.width = 56; img.height = 70; art.append(img); }
  const m = progressParts(s.meta).length ? meters(s.meta) : el('p', 'meter-top', 'Saved game');
  win.append(art, m);
  cart.append(label, win);
  const when = ago(s.meta?.updated);
  if (when) cart.append(withNums('cart-when', when));
  const go = button('btn btn-accent', null, () => play(g, s.n));
  go.append(icon('play'), 'Continue');
  cart.append(go);
  wrap.append(cart);
  host.replaceChildren(wrap);
}

/* ---------- What's new ---------- */
let news = [], newsState = 'loading';
const readIds = () => new Set(Array.isArray(store.json(KEY.newsRead)) ? store.json(KEY.newsRead) : []);
function validNews(n) {
  return n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.date);
}
async function loadNews() {
  newsState = 'loading'; renderNews();
  try {
    const r = await fetch('news.json');
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    news = (Array.isArray(data) ? data : []).filter(validNews)
      .map(n => ({ id: n.id.slice(0, 64), date: n.date, title: n.title.slice(0, 80), body: n.body.slice(0, 600) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    newsState = 'ok';
  } catch { newsState = 'error'; }
  renderNews();
}
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
function renderNews() {
  const list = $('news'), read = readIds();
  list.replaceChildren();
  if (newsState === 'loading') { list.append(el('li', 'skeleton')); }
  else if (newsState === 'error') {
    const li = el('li', 'news-note');
    li.append(el('span', null, "Couldn't load updates."), button('btn', 'Try again', loadNews));
    list.append(li);
  } else if (!news.length) {
    list.append(el('li', 'news-note', 'No updates yet. News about games and changes will show up here.'));
  }
  for (const n of newsState === 'ok' ? news : []) {
    const li = el('li'), b = el('button', 'news-item' + (read.has(n.id) ? '' : ' unread'));
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    const [y, mo, d] = n.date.split('-').map(Number);
    b.append(el('i', 'dot'), el('span', 'news-title', n.title), withNums('news-date', dateFmt.format(new Date(y, mo - 1, d))));
    const body = el('p', 'news-body', n.body);
    body.hidden = true;
    b.append(body);
    if (!read.has(n.id)) b.setAttribute('aria-label', `Unread: ${n.title}`);
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open);
      body.hidden = !open;
      if (open && !readIds().has(n.id)) {
        store.set(KEY.newsRead, JSON.stringify([...readIds(), n.id].slice(-200)));
        b.classList.remove('unread');
        b.removeAttribute('aria-label');
        renderBadge();
      }
    });
    li.append(b);
    list.append(li);
  }
  renderBadge();
}
function renderBadge() {
  const read = readIds(), unread = news.some(n => !read.has(n.id)), home = $('tab-home');
  home.querySelector('.dot')?.remove();
  if (unread) { const d = el('i', 'dot'); d.setAttribute('aria-hidden', 'true'); home.append(d); }
  home.setAttribute('aria-label', unread ? 'Home, unread updates' : 'Home');
}

/* ---------- Library ---------- */
function renderLibrary() {
  const lib = $('library');
  lib.replaceChildren();
  lib.toggleAttribute('aria-busy', gamesState === 'loading');
  $('game-count').textContent = gamesState === 'ok' ? (games.length === 1 ? '1 game' : `${games.length} games`) : '';
  if (gamesState === 'loading') { lib.append(el('div', 'skeleton'), el('div', 'skeleton')); return; }
  if (gamesState === 'error') {
    lib.append(stateBox('!', "Couldn't load your games",
      'Check your connection, then try again. Games you have opened before still work offline.',
      button('btn', 'Try again', loadGames)));
    return;
  }
  if (!games.length) { lib.append(stateBox('[ ]', 'No games yet', 'New games will appear here as soon as they are released.')); return; }
  for (const g of games) {
    const b = button('tile', null, () => openGame(g));
    b.dataset.id = g.id;
    paint(b, g);
    const art = el('span', 'tile-art');
    if (g.art) { const img = el('img'); img.src = g.art; img.alt = ''; img.width = 48; img.height = 60; art.append(img); }
    const used = readSlots(g).filter(s => s.used).length;
    const text = el('span', 'tile-text');
    text.append(el('span', 'tile-title', g.title), el('span', 'tile-tag', g.tagline || ''),
      el('span', 'tile-meta', used ? `${used} save${used > 1 ? 's' : ''}` : 'New'));
    b.append(art, text);
    lib.append(b);
  }
}

/* ---------- Progress ---------- */
function renderProgress() {
  const host = $('progress');
  host.replaceChildren();
  if (gamesState === 'loading') { host.append(el('div', 'skeleton')); return; }
  if (gamesState === 'error') { host.append(stateBox('!', "Couldn't load your games", 'Progress shows once your games load.', button('btn', 'Try again', loadGames))); return; }
  let any = false;
  for (const g of games) {
    const saves = readSlots(g).filter(s => s.used);
    if (!saves.length) continue;
    any = true;
    const box = el('section', 'prog-game');
    paint(box, g);
    box.append(el('h2', null, g.title));
    for (const s of saves) {
      const row = el('div', 'prog-save');
      row.append(el('h3', null, `Save ${s.n}`), progressParts(s.meta).length ? meters(s.meta) : el('p', null, 'Progress shows after the next save.'));
      box.append(row);
    }
    host.append(box);
  }
  if (!any) host.append(stateBox('[ ]', 'No progress yet', 'Endings, notes and unlocks show up here once you play.', button('btn btn-brand', 'Open Library', () => showTab('library'))));
}

/* ---------- Profile totals ---------- */
function playtime(sec) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : m ? `${m}m` : sec > 0 ? '<1m' : '0m';
}
function renderTotals() {
  const sum = new Map();
  for (const g of games) for (const s of readSlots(g)) {
    if (!s.used || !s.meta?.totals || typeof s.meta.totals !== 'object') continue;
    for (const [k, v] of Object.entries(s.meta.totals)) if (Number.isFinite(v) && v >= 0) sum.set(k.slice(0, 16), (sum.get(k.slice(0, 16)) || 0) + v);
  }
  const dl = $('totals');
  dl.replaceChildren();
  if (!sum.size) { dl.append(el('p', 'hint', gamesState === 'loading' ? 'Loading…' : 'Your playtime, runs and escapes add up here once you play.')); return; }
  for (const [k, v] of [...sum].sort(([a], [b]) => (b === 'Playtime') - (a === 'Playtime'))) {
    const d = el('div');
    d.append(el('dt', null, k), el('dd', null, k === 'Playtime' ? playtime(v) : String(v)));
    dl.append(d);
  }
}

function allAvatars() {
  return games.flatMap(g => (Array.isArray(g.avatars) ? g.avatars : [])
    .filter(a => a && typeof a.id === 'string' && typeof a.src === 'string' && typeof a.name === 'string')
    .map(a => ({ key: g.id + '/' + a.id, name: a.name.slice(0, 40), src: a.src })));
}
function renderAvatars() {
  const box = $('avatars'), chosen = store.json(KEY.player)?.avatar, list = allAvatars();
  box.replaceChildren();
  if (!list.length) { box.append(el('p', 'hint', gamesState === 'loading' ? 'Loading…' : 'No characters to pick from yet.')); }
  for (const a of list) {
    const label = el('label', 'avatar');
    const r = el('input'); r.type = 'radio'; r.name = 'avatar'; r.value = a.key; r.checked = a.key === chosen;
    r.addEventListener('change', () => {
      store.set(KEY.player, JSON.stringify({ ...(store.json(KEY.player) || {}), avatar: a.key }));
      renderGreeting();
      pushProfile({ avatar: a.key });
      toast(`Avatar: ${a.name}`);
    });
    const img = el('img'); img.src = a.src; img.alt = ''; img.width = 64; img.height = 64;
    label.append(r, img, el('span', null, a.name));
    box.append(label);
  }
  renderGreeting();
}

function renderAll() { renderContinue(); renderLibrary(); renderProgress(); renderTotals(); renderAvatars(); if (current) renderSlots(); }

async function loadGames() {
  gamesState = 'loading'; renderAll();
  try {
    const r = await fetch('games.json');
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    games = (Array.isArray(data) ? data : []).filter(validGame);
    games.forEach(migrateLegacy);
    gamesState = 'ok';
  } catch { gamesState = 'error'; }
  renderAll();
  const fromHash = gamesState === 'ok' && games.find(g => '#' + g.id === location.hash);
  if (fromHash) { history.replaceState(null, '', location.pathname); showTab('library'); openGame(fromHash); }
}

/* ---------- Game screen ---------- */
const screen = $('game');
let current = null;

function renderSlots() {
  const g = current, list = $('g-slots');
  list.replaceChildren();
  for (const s of readSlots(g)) {
    const li = el('li', 'slot-row');
    const b = button('slot' + (s.used ? '' : ' empty'), null, () => play(g, s.n));
    const name = el('span', 'slot-name');
    name.append(el('span', null, `Save ${s.n}`), el('span', 'slot-go', s.used ? 'Continue' : 'Start'));
    b.append(name);
    if (s.used) {
      b.append(withNums('slot-progress', progressText(s.meta) || 'Saved game'));
      const when = ago(s.meta?.updated);
      if (when) b.append(withNums('slot-when', when));
      b.setAttribute('aria-label', `Continue save ${s.n}. ${progressText(s.meta)}`);
    } else {
      b.append(el('span', 'slot-when', 'Empty slot'));
      b.setAttribute('aria-label', `Start a new game in save ${s.n}`);
    }
    li.append(b);
    if (s.used) {
      const del = button('slot-del', null, () => confirmDelete(s));
      del.setAttribute('aria-label', `Delete save ${s.n}`);
      del.append(icon('trash'));
      li.append(del);
    }
    list.append(li);
  }
}

function openGame(g, push = true) {
  current = g;
  paint(screen, g);
  $('g-title').textContent = g.title;
  $('g-tag').textContent = g.tagline || '';
  $('g-warn').hidden = !g.warning;
  $('g-warn').textContent = typeof g.warning === 'string' ? 'Warning: ' + g.warning.slice(0, 140) : '';
  const art = $('g-art');
  art.hidden = !g.art;
  if (g.art) art.src = g.art;
  renderSlots();
  if (push) history.pushState({ game: g.id }, '');
  screen.inert = false;
  screen.scrollTop = 0;
  document.body.classList.add('in-game');
  screen.classList.add('open');
  $('g-back').focus({ preventScroll: true });
}

function closeGame() {
  if (!current) return;
  screen.classList.remove('open');
  document.body.classList.remove('in-game');
  screen.inert = true;
  renderAll(); // save counts may have changed
  document.querySelector(`.tile[data-id="${CSS.escape(current.id)}"]`)?.focus({ preventScroll: true });
  current = null;
}

$('g-back').addEventListener('click', () => history.state?.game ? history.back() : closeGame());
addEventListener('popstate', () => { if (!history.state?.game) closeGame(); });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && current && !$('confirm').open) $('g-back').click();
});

$('g-new').addEventListener('click', () => {
  const free = readSlots(current).find(s => !s.used);
  if (free) play(current, free.n);
  else toast('Every save slot is in use. Delete a save to start a new game.');
});

/* ---------- Confirmation dialog ---------- */
const dlg = $('confirm');
let answer = null;
function ask(title, body, yes, no = 'Cancel', danger = false) {
  dlg.removeAttribute('style');
  if (current) paint(dlg, current);
  $('c-title').textContent = title;
  $('c-body').textContent = body;
  $('c-yes').textContent = yes;
  $('c-yes').className = 'btn ' + (danger ? 'btn-danger' : 'btn-brand');
  $('c-no').textContent = no;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise(res => { answer = res; });
}
dlg.addEventListener('close', () => { const v = dlg.returnValue; answer?.(v === 'yes' ? true : v === 'no' ? false : null); answer = null; });

async function confirmDelete(slot) {
  const p = progressText(slot.meta);
  if (!await ask(`Delete Save ${slot.n}?`, (p ? p + '. ' : '') + 'This cannot be undone.', 'Delete', 'Keep it', true)) return;
  store.del(slot.key);
  store.del(slot.key + '.meta');
  renderSlots();
  toast(`Save ${slot.n} deleted`);
  syncAll();
}

/* ---------- Settings: sound, vibration, touch controls (read by the games) ---------- */
const DEFAULTS = { sound: true, music: true, vibration: true, touchSize: 'm', touchAlpha: 0.75, leftHanded: false, inputMode: 'auto' };
function settings() { return { ...DEFAULTS, ...(store.json(KEY.settings) || {}) }; }
function renderSettings() {
  const s = settings();
  document.querySelectorAll('[data-setting]').forEach(i => {
    const k = i.dataset.setting;
    if (i.type === 'checkbox') i.checked = !!s[k];
    else if (i.type === 'radio') i.checked = i.value === s[k];
    else if (i.type === 'range') i.value = Math.round(s[k] * 100);
  });
  $('tc-alpha-out').textContent = Math.round(s.touchAlpha * 100) + '%';
  const pv = $('tc-preview');
  pv.style.setProperty('--tc-alpha', s.touchAlpha);
  pv.style.setProperty('--tc-scale', { s: 0.85, m: 1, l: 1.2 }[s.touchSize] || 1);
  pv.classList.toggle('lefty', s.leftHanded);
}
document.querySelectorAll('[data-setting]').forEach(i => i.addEventListener(i.type === 'range' ? 'input' : 'change', () => {
  const k = i.dataset.setting, s = settings();
  s[k] = i.type === 'checkbox' ? i.checked : i.type === 'range' ? Math.min(0.95, Math.max(0.2, i.value / 100)) : i.value;
  store.set(KEY.settings, JSON.stringify(s));
  if (k === 'vibration' && s.vibration && navigator.vibrate) navigator.vibrate(20);
  renderSettings();
}));

/* ---------- Export, import, download, delete ---------- */
const MAX_IMPORT = 512 * 1024;
function saveKeys() {
  return games.flatMap(g => readSlots(g).flatMap(s => [s.key, s.key + '.meta']));
}
function download(name, obj) {
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20000);
}
const today = () => new Date().toISOString().slice(0, 10);
function pack(keys) {
  const data = {};
  for (const k of keys) { const v = store.get(k); if (v !== null) data[k] = v; }
  return { app: 'shanoware', v: 1, exported: new Date().toISOString(), data };
}
function savesMsg(text, bad) { const m = $('saves-msg'); m.textContent = text; m.classList.toggle('bad', !!bad); }

$('export').addEventListener('click', () => {
  if (gamesState !== 'ok') { savesMsg('Your games are still loading. Try again in a moment.', true); return; }
  const out = pack([...saveKeys(), KEY.player]);
  const n = saveKeys().filter(k => !k.endsWith('.meta') && out.data[k] !== undefined).length;
  if (!n) { savesMsg('There are no saves to export yet.', true); return; }
  download(`shanoware-saves-${today()}.json`, out);
  savesMsg(`Exported ${n} save${n > 1 ? 's' : ''}.`);
});

// Everything from a file is checked before any of it is stored. Returns entries to write, or an error message.
function checkImport(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== 'shanoware' || obj.v !== 1 || !obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data))
    return { error: "That isn't a Shanoware save file." };
  const allowed = new Set(saveKeys()), entries = [];
  for (const [k, v] of Object.entries(obj.data)) {
    if (typeof v !== 'string' || v.length > 200000) continue;
    let parsed; try { parsed = JSON.parse(v); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    if (allowed.has(k)) entries.push([k, v]);
    else if (k === KEY.player) {
      const avatar = allAvatars().some(a => a.key === parsed.avatar) ? parsed.avatar : undefined;
      entries.push([k, JSON.stringify({ name: cleanName(parsed.name), avatar })]);
    }
  }
  const saves = entries.filter(([k]) => allowed.has(k) && !k.endsWith('.meta')).length;
  if (!saves) return { error: 'That file has no saves for the games here.' };
  return { entries, saves };
}
let importing = false;
$('import').addEventListener('click', () => { if (!importing) $('import-file').click(); });
$('import-file').addEventListener('change', async () => {
  const f = $('import-file').files[0];
  $('import-file').value = '';
  if (!f || importing) return;
  if (f.size > MAX_IMPORT) { savesMsg('That file is too big to be a save file. Nothing was changed.', true); return; }
  importing = true; $('import').disabled = true; savesMsg('Checking the file…');
  try {
    let obj; try { obj = JSON.parse(await f.text()); } catch { obj = null; }
    const res = checkImport(obj);
    if (res.error) { savesMsg(res.error + ' Nothing was changed.', true); return; }
    const when = typeof obj.exported === 'string' ? obj.exported.slice(0, 10) : 'an earlier date';
    if (!await ask('Import saves?', `This file has ${res.saves} save${res.saves > 1 ? 's' : ''} from ${when}. Saves in the same slots on this device will be replaced.`, 'Import')) { savesMsg('Import cancelled. Nothing was changed.'); return; }
    // A save's summary must match the save; drop old summaries for replaced slots, then write.
    for (const [k] of res.entries) if (!k.endsWith('.meta') && k !== KEY.player) store.del(k + '.meta');
    for (const [k, v] of res.entries) store.set(k, v);
    const base = syncBase(); for (const [k] of res.entries) delete base[k]; store.set(KEY.sync, JSON.stringify(base));
    syncAll();
    renderAll(); $('name-input').value = playerName();
    savesMsg(`Imported ${res.saves} save${res.saves > 1 ? 's' : ''}.`);
  } finally { importing = false; $('import').disabled = false; }
});

$('download-data').addEventListener('click', async () => {
  const keys = new Set(saveKeys());
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('shanoware.')) keys.add(k); } } catch {}
  const out = pack([...keys]);
  if (cloud && user) {
    try { out.account = await cloud.exportAll(); }
    catch (e) { toast(cloud.explain(e) + ' Downloading what is on this device.'); }
  }
  download(`shanoware-my-data-${today()}.json`, out);
});

function wipeLocal(keepSettings) {
  const keys = new Set(saveKeys());
  games.forEach(g => g.legacyKey && keys.add(g.legacyKey));
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('shanoware.') && !k.startsWith('shanoware.dev.')) keys.add(k); } } catch {}
  if (keepSettings) [...keys].filter(k => [KEY.settings, KEY.bar, KEY.welcomed, KEY.ageBlocked, KEY.pendingDelete].includes(k) || k.startsWith('shanoware.keys.')).forEach(k => keys.delete(k));
  keys.forEach(k => store.del(k));
}
$('wipe').addEventListener('click', async () => {
  if (cloud && user) { deleteAccount(); return; }
  if (!await ask('Delete everything?', 'This removes every save, your name, avatar and settings from this device. Export your saves first if you want to keep them. This cannot be undone.', 'Delete everything', 'Cancel', true)) return;
  wipeLocal(false);
  location.reload();
});

/* ---------- Error log (local only) ---------- */
const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function errorLog() { const l = store.json(KEY.errors); return Array.isArray(l) ? l.filter(e => e && typeof e.msg === 'string') : []; }
function renderErrors() {
  const list = $('errors'), log = errorLog().slice().reverse();
  list.replaceChildren();
  $('errors-actions').hidden = !log.length;
  if (!log.length) { list.append(el('li', 'hint', 'No errors recorded on this device.')); return; }
  for (const e of log) {
    const li = el('li');
    li.append(el('span', 'err-when', `${timeFmt.format(new Date(e.t))} · ${String(e.page || '').slice(0, 60)}`), el('span', 'err-msg', e.msg), el('span', 'err-src', String(e.src || '')));
    list.append(li);
  }
}
$('errors-copy').addEventListener('click', async () => {
  const text = errorLog().map(e => `${new Date(e.t).toISOString()} ${e.page} ${e.msg} ${e.src || ''}`).join('\n');
  try { await navigator.clipboard.writeText(text); toast('Error log copied'); }
  catch { toast("Couldn't copy. Use Download my data instead."); }
});
$('errors-clear').addEventListener('click', () => { store.del(KEY.errors); renderErrors(); toast('Error log cleared'); });

/* ---------- Offline, and protecting saves from automatic clean-up ---------- */
function renderOnline() { $('offline').hidden = navigator.onLine; }
addEventListener('online', renderOnline);
addEventListener('offline', renderOnline);
async function protectStorage() {
  const out = $('storage-status');
  if (!navigator.storage?.persist) { out.textContent = ''; return; }
  let ok = await navigator.storage.persisted().catch(() => false);
  if (!ok) ok = await navigator.storage.persist().catch(() => false);
  out.textContent = ok ? 'Protected: your phone will not clear these saves to free up space.'
    : 'Not protected yet: if your phone runs very low on space it may clear saved data. Adding Shanoware to your home screen usually protects it.';
}

/* ---------- Accounts and cloud saves (only when firebase-config.js is filled in) ---------- */
let cloud = null, user = null, buttondown = null, configured = false;
const isLocalhost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
function logError(msg) {
  const l = errorLog(); l.push({ t: Date.now(), page: 'app', msg: String(msg).slice(0, 300), src: '' });
  store.set(KEY.errors, JSON.stringify(l.slice(-50)));
}
async function startCloud() {
  let cfg = null;
  // Test settings are honoured on this computer only, never in the released app.
  if (isLocalhost) { try { cfg = JSON.parse(store.get('shanoware.dev.config')); } catch {} }
  try { const m = await import('./firebase-config.js'); cfg = cfg || m.firebaseConfig; buttondown = m.buttondownUser || null; } catch {}
  configured = !!cfg;
  if (!cfg) return false;
  try { cloud = await import('./cloud.js'); cloud.start(cfg); return true; }
  catch (e) { logError('Accounts could not start: ' + e.message); cloud = null; return false; }
}

const gateSteps = [...document.querySelectorAll('.g-step')];
function gate(step, text) {
  $('gate').hidden = false;
  gateSteps.forEach(g => { g.hidden = g.dataset.g !== step; });
  if (text) $('g-working').textContent = text;
  const shown = gateSteps.find(g => g.dataset.g === step);
  shown.querySelector('input:not([type=checkbox]), select, button')?.focus({ preventScroll: true });
}
let gateDone;
const gatePassed = new Promise(res => { gateDone = res; });
function openApp() { $('gate').hidden = true; gateDone(); renderAccount(); syncAll(); }

async function accountGate() {
  if (store.get(KEY.ageBlocked)) { configured = true; gate('blocked'); return gatePassed; }
  if (!await startCloud()) {
    if (configured) { gate('offline'); return gatePassed; } // accounts are on but the code couldn't load (offline)
    return; // accounts not set up yet: the app runs on this device only
  }
  user = await new Promise(res => { const off = cloud.onUser(u => { off(); res(u); }); });
  cloud.onUser(u => { user = u; renderAccount(); });
  if (cloud.isLink()) {
    const email = cloud.rememberedEmail();
    if (email) finishLink(email); else gate('confirm');
  } else if (user) afterSignIn();
  else gate(navigator.onLine ? 'signin' : 'offline');
  return gatePassed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function checkEmail(input, err) {
  const v = input.value.trim();
  const ok = EMAIL_RE.test(v) && input.checkValidity();
  input.setAttribute('aria-invalid', !ok);
  err.textContent = ok ? '' : "That email address doesn't look right.";
  if (!ok) input.focus();
  return ok ? v : null;
}
// Rate limit on this device: one email a minute, five an hour. Firebase limits on its side too.
function canSend() {
  const now = Date.now(), sends = (store.json(KEY.linkSends) || []).filter(t => now - t < 3600e3);
  if (sends.length && now - sends[sends.length - 1] < 60e3) return Math.ceil((60e3 - (now - sends[sends.length - 1])) / 1000);
  if (sends.length >= 5) return Math.ceil((3600e3 - (now - sends[0])) / 1000);
  return 0;
}
function noteSend() { const now = Date.now(); store.set(KEY.linkSends, JSON.stringify([...(store.json(KEY.linkSends) || []).filter(t => now - t < 3600e3), now])); }
let resendTimer;
function resendCountdown() {
  clearInterval(resendTimer);
  const b = $('g-resend');
  const tick = () => { const w = canSend(); b.disabled = w > 0; b.textContent = w > 0 ? `Send again in ${w > 90 ? Math.ceil(w / 60) + ' min' : w + 's'}` : 'Send again'; if (!w) clearInterval(resendTimer); };
  tick(); resendTimer = setInterval(tick, 1000);
}
let sending = false;
async function sendLink(email, errEl) {
  const wait = canSend();
  if (wait) { errEl.textContent = `Please wait ${wait > 90 ? Math.ceil(wait / 60) + ' minutes' : wait + ' seconds'} before asking for another email.`; return false; }
  if (sending) return false;
  sending = true; $('g-send').disabled = true; $('g-send').textContent = 'Sending…';
  try {
    await cloud.sendLink(email);
    noteSend();
    $('g-sent-to').textContent = email;
    gate('sent'); resendCountdown();
    return true;
  } catch (e) { errEl.textContent = cloud.explain(e); return false; }
  finally { sending = false; $('g-send').disabled = false; $('g-send').textContent = 'Email me a sign-in link'; }
}
$('g-email').closest('form').addEventListener('submit', e => {
  e.preventDefault();
  const email = checkEmail($('g-email'), $('g-email-err'));
  if (email) sendLink(email, $('g-email-err'));
});
$('g-resend').addEventListener('click', () => { $('g-sent-err').textContent = ''; sendLink($('g-sent-to').textContent, $('g-sent-err')); });
$('g-other').addEventListener('click', () => gate('signin'));
$('g-retry').addEventListener('click', () => location.reload());
$('g-confirm-email').closest('form').addEventListener('submit', e => {
  e.preventDefault();
  const email = checkEmail($('g-confirm-email'), $('g-confirm-err'));
  if (email) finishLink(email);
});

async function finishLink(email) {
  gate('working', 'Signing you in…');
  try { user = await cloud.finishLink(email); afterSignIn(); }
  catch (e) { gate('signin'); $('g-email').value = email; $('g-email-err').textContent = cloud.explain(e); }
}

async function afterSignIn() {
  const acct = store.json(KEY.acct);
  // Signed in before on this device: play straight away, even offline. The profile refreshes when online.
  if (acct?.uid === user.uid) { openApp(); refreshProfile(); return; }
  gate('working', 'Loading your account…');
  try {
    const profile = await cloud.getProfile();
    if (!profile) { gate('signup'); return; }
    // A different account than this device's saves belong to: start clean so saves never mix.
    if (acct && acct.uid !== user.uid) wipeLocal(true);
    adoptProfile(profile);
    store.set(KEY.acct, JSON.stringify({ uid: user.uid }));
    openApp();
  } catch (e) { gate(navigator.onLine ? 'signin' : 'offline'); $('g-email-err').textContent = cloud.explain(e); }
}
function adoptProfile(p) {
  const local = store.json(KEY.player) || {};
  store.set(KEY.player, JSON.stringify({ name: cleanName(local.name || p.name), avatar: local.avatar || p.avatar || undefined, emailUpdates: !!p.emailUpdates }));
  if (p.name && !store.get(KEY.welcomed)) $('w-name').value = cleanName(p.name);
  $('name-input').value = playerName();
  renderGreeting(); renderAvatars();
}
async function refreshProfile() {
  try { const p = await cloud.getProfile(); if (p) { adoptProfile(p); renderAccount(); } } catch {}
}
let profileTimer, profilePending = {};
function pushProfile(fields) {
  if (!cloud || !user || !store.json(KEY.acct)) return;
  Object.assign(profilePending, fields);
  clearTimeout(profileTimer);
  profileTimer = setTimeout(async () => {
    const f = profilePending; profilePending = {};
    try { await cloud.updateProfile(f); } catch (e) { logError('Profile not saved to account: ' + cloud.explain(e)); }
  }, 2500); // the server accepts at most one profile change every 2 seconds
}

// Age check: only "13 or older" is ever stored, never the birth date.
(function fillAgeSelects() {
  const months = new Intl.DateTimeFormat(undefined, { month: 'long' });
  for (let m = 1; m <= 12; m++) { const o = el('option', null, months.format(new Date(2000, m - 1, 1))); o.value = m; $('g-month').append(o); }
  const y = new Date().getFullYear();
  for (let i = y; i >= y - 100; i--) { const o = el('option', null, String(i)); o.value = i; $('g-year').append(o); }
})();
function is13(year, month) {
  // Counted from the last day of the birth month, so nobody is let in early.
  const birth = new Date(year, month, 0), turns13 = new Date(birth.getFullYear() + 13, birth.getMonth(), birth.getDate());
  return turns13 <= new Date();
}
let creating = false;
$('g-month').closest('form').addEventListener('submit', async e => {
  e.preventDefault();
  if (creating) return;
  const m = +$('g-month').value, y = +$('g-year').value;
  if (!m || !y) { $('g-age-err').textContent = 'Choose the month and year you were born.'; (m ? $('g-year') : $('g-month')).focus(); return; }
  $('g-age-err').textContent = '';
  if (!is13(y, m)) {
    store.set(KEY.ageBlocked, '1');
    try { await cloud.removeSignInAccount(); } catch { try { await cloud.signOut(); } catch {} }
    gate('blocked');
    return;
  }
  creating = true; $('g-create').disabled = true; $('g-create').textContent = 'Creating…';
  const emailUpdates = $('g-updates').checked;
  try {
    const local = store.json(KEY.player) || {};
    await cloud.createProfile({ name: cleanName(local.name), avatar: local.avatar, emailUpdates });
    if (emailUpdates) subscribe(user.email);
    store.set(KEY.player, JSON.stringify({ ...local, emailUpdates }));
    store.set(KEY.acct, JSON.stringify({ uid: user.uid }));
    openApp();
  } catch (err) { $('g-age-err').textContent = cloud.explain(err); }
  finally { creating = false; $('g-create').disabled = false; $('g-create').textContent = 'Create my account'; }
});

// Email updates go through Buttondown's public sign-up form; Buttondown sends its own confirmation email.
function subscribe(email) {
  if (!buttondown || !email) return;
  fetch(`https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(buttondown)}`, {
    method: 'POST', mode: 'no-cors', body: new URLSearchParams({ email, tag: 'shanoware' }),
  }).catch(e => logError('Email sign-up failed: ' + e.message));
}

/* ---------- Sync: this device <-> account ---------- */
// For each slot we remember the cloud version we last agreed on ("base").
const syncBase = () => store.json(KEY.sync) || {};
const toCloudMeta = m => ({ progress: (m.progress || []).map(([l, h, t]) => ({ l, h, t })), totals: m.totals || {} });
const fromCloudMeta = (m, updated) => ({ progress: (m?.progress || []).map(p => [p.l, p.h, p.t]), totals: m?.totals || {}, updated });
let syncing = null, lastSync = null, syncProblem = '';
function syncAll() {
  if (!cloud || !user || !store.json(KEY.acct) || gamesState !== 'ok') return Promise.resolve(false);
  if (syncing) return syncing;
  syncing = doSync().finally(() => { syncing = null; renderSync(); });
  return syncing;
}
async function doSync() {
  if (!navigator.onLine) { syncProblem = "You're offline. Saves will sync when you're back online."; return false; }
  let remote;
  try { remote = await cloud.listSaves(); }
  catch (e) { syncProblem = cloud.explain(e); return false; }
  const base = syncBase(); let changed = false, ok = true;
  for (const g of games) for (const s of readSlots(g)) {
    const r = remote.get(`${g.id}-${s.n}`), b = base[s.key];
    const localData = store.get(s.key), localMeta = s.meta, localUpdated = typeof localMeta?.updated === 'number' ? localMeta.updated : 0;
    const pull = () => { store.set(s.key, JSON.stringify(r.data)); store.set(s.key + '.meta', JSON.stringify(fromCloudMeta(r.meta, r.updated))); base[s.key] = r.updated; changed = true; };
    // Each upload gets a new version time, so other devices always notice the change.
    const push = async (updated = Math.max(Date.now(), (b || 0) + 1)) => {
      if (!localMeta?.totals) return; // the game writes the summary the first time it opens this save
      try { await cloud.putSave(g.id, s.n, JSON.parse(localData), toCloudMeta(localMeta), updated); base[s.key] = updated;
        if (!localMeta.updated) { store.set(s.key + '.meta', JSON.stringify({ ...localMeta, updated })); } }
      catch (e) { ok = false; logError(`Save ${s.n} of ${g.title} did not sync: ${cloud.explain(e)}`); }
    };
    try {
      if (localData === null && !r) delete base[s.key];
      else if (localData === null) {
        if (b !== undefined && r.updated === b) { await cloud.removeSave(g.id, s.n); delete base[s.key]; }  // deleted here
        else pull();                                                                                   // new from another device
      } else if (!r) {
        if (b !== undefined && localUpdated <= b) { store.del(s.key); store.del(s.key + '.meta'); delete base[s.key]; changed = true; } // deleted on another device
        else await push();
      } else if (JSON.stringify(JSON.parse(localData)) === JSON.stringify(r.data)) base[s.key] = r.updated;
      else if (b === r.updated) await push();                          // only this device changed
      else if (b !== undefined && localUpdated <= b) pull();           // only the account changed
      else {                                                           // both changed: the player decides
        const choice = await ask(`Which ${g.title} Save ${s.n} should be kept?`,
          `This device: ${progressText(localMeta) || 'saved game'}${localUpdated ? ', ' + ago(localUpdated).toLowerCase() : ''}.\n` +
          `Your account: ${progressText(fromCloudMeta(r.meta)) || 'saved game'}, ${ago(r.updated).toLowerCase()}.\nThe other one will be replaced.`,
          'Keep account save', 'Keep this device');
        if (choice === true) pull();
        else if (choice === false) await push(Date.now());
        else ok = false; // dismissed: ask again next time
      }
    } catch (e) { ok = false; logError(`Save ${s.n} of ${g.title} did not sync: ${cloud.explain(e)}`); }
  }
  store.set(KEY.sync, JSON.stringify(base));
  if (changed) renderAll();
  lastSync = Date.now(); syncProblem = ok ? '' : 'Some saves did not sync. Details are in the error log.';
  return ok;
}
function renderSync() {
  const out = $('sync-status');
  out.hidden = !(cloud && user);
  out.textContent = syncProblem || (lastSync ? `Synced with your account ${ago(lastSync).replace('Played ', '')}.` : 'Not synced yet.');
  out.classList.toggle('bad', !!syncProblem);
}
addEventListener('online', () => syncAll());
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAll(); });

/* ---------- Account settings ---------- */
function renderAccount() {
  const signedIn = !!(cloud && user && store.json(KEY.acct));
  $('acct-line').textContent = signedIn ? `Signed in as ${user.email}.` : 'Download everything Shanoware keeps about you, or remove it all from this device.';
  $('acct-updates-row').hidden = !signedIn;
  $('acct-updates').checked = !!store.json(KEY.player)?.emailUpdates;
  $('sign-out').hidden = !signedIn;
  $('wipe').textContent = signedIn ? 'Delete my account' : 'Delete everything';
  renderSync();
}
$('acct-updates').addEventListener('change', () => {
  const on = $('acct-updates').checked;
  store.set(KEY.player, JSON.stringify({ ...(store.json(KEY.player) || {}), emailUpdates: on }));
  pushProfile({ emailUpdates: on });
  if (on) { subscribe(user.email); $('acct-msg').textContent = 'You may get an email asking you to confirm.'; }
  else $('acct-msg').textContent = 'Turned off. To stop emails already on their way, use the unsubscribe link at the bottom of any email.';
});
$('sign-out').addEventListener('click', async () => {
  if (!await ask('Sign out?', 'Your saves stay in your account and come back when you sign in again. They will be removed from this device.', 'Sign out')) return;
  const synced = await syncAll();
  if (!synced && !await ask("Some saves haven't synced", 'Signing out now would lose the changes that only exist on this device. Sign out anyway?', 'Sign out anyway', 'Stay signed in')) return;
  wipeLocal(true);
  await cloud.signOut();
  location.reload();
});
async function deleteAccount() {
  if (!await ask('Delete your account?', 'This deletes your account, every save, your stats and your profile, from your account and this device. This cannot be undone. Export your saves first if you want to keep a copy.', 'Delete my account', 'Cancel', true)) return;
  if (!cloud.recentlySignedIn()) {
    if (!await ask('Sign in again first', "For safety, you need to sign in again before deleting your account. You'll be signed out now; after you sign back in, you'll be asked to confirm.", 'Sign out and continue')) return;
    store.set(KEY.pendingDelete, '1');
    wipeLocal(true); await cloud.signOut(); location.reload();
    return;
  }
  $('wipe').disabled = true; $('acct-msg').textContent = 'Deleting…';
  try {
    await cloud.deleteAccount();
    wipeLocal(false);
    location.reload();
  } catch (e) { $('acct-msg').textContent = cloud.explain(e); $('wipe').disabled = false; }
}

/* ---------- Welcome (first launch only) ---------- */
const welcome = $('welcome'), steps = [...welcome.querySelectorAll('.w-step')], dots = [...welcome.querySelectorAll('.steps li')];
function goStep(i) {
  steps.forEach((s, j) => { s.hidden = j !== i; });
  dots.forEach((d, j) => d.classList.toggle('on', j <= i));
  dots[i].setAttribute('aria-current', 'step');
  steps[i].querySelector('input, button.btn-brand')?.focus({ preventScroll: true });
}
steps[0].addEventListener('submit', e => { e.preventDefault(); if (saveName($('w-name'), $('w-name-err'))) goStep(1); });
welcome.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => goStep(+b.dataset.go)));
$('w-done').addEventListener('click', () => {
  store.set(KEY.welcomed, '1');
  welcome.hidden = true;
  $('tab-home').focus({ preventScroll: true });
});
function maybeWelcome() {
  if (store.get(KEY.welcomed)) return;
  $('w-name').value = playerName();
  welcome.hidden = false;
  goStep(0);
}

/* ---------- Keep things fresh when coming back from a game ---------- */
addEventListener('pageshow', e => { if (e.persisted) { leaving = false; renderAll(); renderErrors(); syncAll(); } });
addEventListener('storage', () => { renderAll(); renderSettings(); renderErrors(); });

/* ---------- Start ---------- */
$('name-input').value = playerName();
renderGreeting();
renderAll();
renderSettings();
renderErrors();
renderOnline();
protectStorage();
const shown = Date.now();
Promise.all([loadGames(), loadNews()]).finally(() => {
  // Keep the splash up long enough to read, never longer than loading takes past that.
  setTimeout(async () => {
    $('splash').classList.add('done');
    await accountGate();
    maybeWelcome();
    if (store.get(KEY.pendingDelete) && cloud && user) { store.del(KEY.pendingDelete); showTab('settings'); deleteAccount(); }
  }, Math.max(0, 500 - (Date.now() - shown)));
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
