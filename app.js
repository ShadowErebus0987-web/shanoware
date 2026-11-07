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
const KEY = { bar: 'shanoware.bar', player: 'shanoware.player', welcomed: 'shanoware.welcomed', last: 'shanoware.last', newsRead: 'shanoware.newsRead' };

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
  store.set(KEY.bar, side);
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
  store.set(KEY.player, JSON.stringify({ name }));
  input.value = name;
  renderGreeting();
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
    .map(([label, have, total]) => ({ label: label.slice(0, 16), have: Math.max(0, have), total: Number.isFinite(total) && total > 0 ? total : null }));
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
function renderTotals() {
  const sum = new Map();
  for (const g of games) for (const s of readSlots(g)) {
    if (!s.used || !s.meta?.totals || typeof s.meta.totals !== 'object') continue;
    for (const [k, v] of Object.entries(s.meta.totals)) if (Number.isFinite(v) && v >= 0) sum.set(k.slice(0, 16), (sum.get(k.slice(0, 16)) || 0) + v);
  }
  const dl = $('totals');
  dl.replaceChildren();
  if (!sum.size) { dl.append(el('p', 'hint', gamesState === 'loading' ? 'Loading…' : 'Your runs and escapes add up here once you play.')); return; }
  for (const [k, v] of sum) { const d = el('div'); d.append(el('dt', null, k), el('dd', null, String(v))); dl.append(d); }
}

function renderAll() { renderContinue(); renderLibrary(); renderProgress(); renderTotals(); if (current) renderSlots(); }

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

/* ---------- Delete with confirmation ---------- */
const dlg = $('confirm');
let pending = null;
function confirmDelete(slot) {
  pending = slot;
  $('c-title').textContent = `Delete Save ${slot.n}?`;
  const p = progressText(slot.meta);
  $('c-body').textContent = (p ? p + '. ' : '') + 'This cannot be undone.';
  dlg.showModal();
}
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'delete' && pending && current) {
    store.del(pending.key);
    store.del(pending.key + '.meta');
    renderSlots();
    toast(`Save ${pending.n} deleted`);
  }
  dlg.returnValue = '';
  pending = null;
});

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
addEventListener('pageshow', e => { if (e.persisted) { leaving = false; renderAll(); } });
addEventListener('storage', () => { renderAll(); renderGreeting(); });

/* ---------- Start ---------- */
$('name-input').value = playerName();
renderGreeting();
renderAll();
const shown = Date.now();
Promise.all([loadGames(), loadNews()]).finally(() => {
  // Keep the splash up long enough to read, never longer than loading takes past that.
  setTimeout(() => { $('splash').classList.add('done'); maybeWelcome(); }, Math.max(0, 500 - (Date.now() - shown)));
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
