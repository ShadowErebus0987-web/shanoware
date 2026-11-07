// Shano's admin page: overall numbers only. The database rules let only the admin email read these.
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function state(title, text, link) {
  const s = el('div', 'state'); s.append(el('strong', null, title), el('p', null, text));
  if (link) { const a = el('a', 'btn btn-brand', link[0]); a.href = link[1]; s.append(a); }
  $('out').replaceChildren(s);
}

let cfg = null;
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { try { cfg = JSON.parse(localStorage.getItem('shanoware.dev.config')); } catch {} }
try { cfg = cfg || (await import('./firebase-config.js')).firebaseConfig; } catch {}

if (!cfg) state('Accounts are not set up', 'Add your Firebase config to firebase-config.js first.');
else {
  const cloud = await import('./cloud.js');
  cloud.start(cfg);
  const user = await new Promise(res => { const off = cloud.onUser(u => { off(); res(u); }); });
  if (!user) state('Sign in first', 'Sign in to Shanoware with your admin email, then come back to this page.', ['Open Shanoware', './']);
  else {
    $('who').textContent = 'Signed in as ' + user.email;
    let games = [];
    try { games = (await (await fetch('games.json')).json()).filter(g => g && typeof g.id === 'string'); } catch {}
    const load = async () => {
      $('refresh').disabled = true;
      $('out').replaceChildren(el('div', 'skeleton'));
      try {
        const c = await cloud.adminCounts(games.map(g => g.id));
        const dl = el('dl', 'totals');
        const add = (k, v) => { const d = el('div'); d.append(el('dt', null, k), el('dd', null, String(v))); dl.append(d); };
        add('Players', c.players); add('New, 7 days', c.week); add('New, 30 days', c.month); add('Email updates on', c.emails);
        for (const g of games) add(`${g.title.slice(0, 30)}: saves`, c.games[g.id] ?? 0);
        $('out').replaceChildren(dl, el('p', 'hint', `Updated ${new Date().toLocaleTimeString()}. "Saves" counts save slots in use, so one player can count more than once.`));
      } catch (e) {
        if (e?.code === 'permission-denied') state('This page is only for Shano', "Your account doesn't have access.");
        else state("Couldn't load the numbers", cloud.explain(e));
      } finally { $('refresh').hidden = false; $('refresh').disabled = false; }
    };
    $('refresh').addEventListener('click', load);
    load();
  }
}
