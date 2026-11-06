'use strict';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// localStorage can throw (private mode, full disk); the launcher must still work.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
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
  const b = el('button', 'tabbtn');
  b.type = 'button';
  b.id = 'tab-' + id;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-controls', 'panel-' + id);
  if (document.getElementById('i-' + id)) b.append(icon(id));
  b.append(el('span', null, sec.dataset.label));
  b.addEventListener('click', () => showTab(id));
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
showTab(sections[0].dataset.tab);

/* ---------- Tab bar position (Settings) ---------- */
const BAR_KEY = 'savepoint.bar';
const SIDES = ['top', 'right', 'bottom', 'left'];
function setBar(side, animate) {
  if (!SIDES.includes(side)) side = 'bottom';
  const apply = () => { document.body.dataset.bar = side; };
  animate ? withTransition(apply) : apply();
  store.set(BAR_KEY, side);
  document.querySelector(`input[name="bar"][value="${side}"]`).checked = true;
}
document.querySelectorAll('input[name="bar"]').forEach(r =>
  r.addEventListener('change', () => setBar(r.value, true)));
setBar(store.get(BAR_KEY), false);

/* ---------- Games ---------- */
let games = [];

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

// Slot n lives at saveKey+n; the game writes a small summary beside it at saveKey+n+".meta":
// {"progress": [["Endings", 3, 18], ["Notes", 5, 8]], "updated": <ms timestamp>}
// A game's old single save (legacyKey) becomes Save 1; removed only once copied.
function migrateLegacy(g) {
  const old = g.legacyKey && store.get(g.legacyKey), first = (g.saveKey || g.id + '.slot') + 1;
  if (old != null && store.get(first) === null) { store.set(first, old); if (store.get(first) === old) store.del(g.legacyKey); }
}
function readSlots(g) {
  const count = Math.max(1, Math.min(9, g.slots | 0 || 3));
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1, key = (g.saveKey || g.id + '.slot') + n;
    let meta = null;
    try { meta = JSON.parse(store.get(key + '.meta')); } catch {}
    return { n, key, used: store.get(key) !== null, meta: meta && typeof meta === 'object' ? meta : null };
  });
}
function progressText(meta) {
  const parts = Array.isArray(meta?.progress) ? meta.progress : [];
  return parts.filter(Array.isArray).map(([label, have, total]) =>
    total != null ? `${label} ${have}/${total}` : `${label} ${have}`).join(' · ');
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

function renderLibrary() {
  const lib = $('library');
  lib.replaceChildren();
  $('game-count').textContent = games.length === 1 ? '1 game' : `${games.length} games`;
  if (!games.length) {
    const s = el('div', 'state');
    s.append(el('span', 'state-mark', '[ ]'), el('strong', null, 'No games yet'),
      el('p', null, 'Games added to the library will appear here.'));
    lib.append(s);
    return;
  }
  for (const g of games) {
    const b = el('button', 'tile');
    b.type = 'button';
    b.dataset.id = g.id;
    paint(b, g);
    const art = el('span', 'tile-art');
    if (g.art) { const img = el('img'); img.src = g.art; img.alt = ''; img.width = 48; img.height = 60; art.append(img); }
    const used = readSlots(g).filter(s => s.used).length;
    const text = el('span', 'tile-text');
    text.append(el('span', 'tile-title', g.title), el('span', 'tile-tag', g.tagline || ''),
      el('span', 'tile-meta', used ? `${used} save${used > 1 ? 's' : ''}` : 'New'));
    b.append(art, text);
    b.addEventListener('click', () => openGame(g));
    lib.append(b);
  }
}

function renderLoading() {
  $('game-count').textContent = '';
  $('library').replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'));
  $('library').setAttribute('aria-busy', 'true');
}
function renderError() {
  const s = el('div', 'state');
  const retry = el('button', 'btn', 'Try again');
  retry.type = 'button';
  retry.addEventListener('click', loadGames);
  s.append(el('span', 'state-mark', '!'), el('strong', null, "Couldn't load your games"),
    el('p', null, 'Check your connection, then try again. Games you have opened before still work offline.'), retry);
  $('game-count').textContent = '';
  $('library').replaceChildren(s);
}

async function loadGames() {
  renderLoading();
  try {
    const r = await fetch('games.json');
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    games = (Array.isArray(data) ? data : []).filter(validGame);
    games.forEach(migrateLegacy);
    renderLibrary();
    const fromHash = games.find(g => '#' + g.id === location.hash);
    if (fromHash) { history.replaceState(null, '', location.pathname); openGame(fromHash); }
  } catch {
    renderError();
  } finally {
    $('library').removeAttribute('aria-busy');
  }
}

/* ---------- Game screen ---------- */
const screen = $('game');
let current = null;

function play(g, n) {
  location.href = `${g.path}?slot=${n}`;
}

function renderSlots() {
  const g = current, list = $('g-slots');
  list.replaceChildren();
  for (const s of readSlots(g)) {
    const li = el('li', 'slot-row');
    const b = el('button', 'slot' + (s.used ? '' : ' empty'));
    b.type = 'button';
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
    b.addEventListener('click', () => play(g, s.n));
    li.append(b);
    if (s.used) {
      const del = el('button', 'slot-del');
      del.type = 'button';
      del.setAttribute('aria-label', `Delete save ${s.n}`);
      del.append(icon('trash'));
      del.addEventListener('click', () => confirmDelete(s));
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
  renderLibrary(); // save counts may have changed
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

/* ---------- Keep saves fresh when coming back from a game ---------- */
addEventListener('pageshow', e => { if (e.persisted) { renderLibrary(); if (current) renderSlots(); } });
addEventListener('storage', () => { if (games.length) renderLibrary(); if (current) renderSlots(); });

loadGames();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
