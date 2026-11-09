// Tests for firestore.rules, run against the local Firestore emulator.
// Run: see tests/README.md
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, collectionGroup, query, where, getCountFromServer, collection, Timestamp } from 'firebase/firestore';

const ADMIN = 'shano@example.com';
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shanoware',
    firestore: {
      host: '127.0.0.1', port: 8085,
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace(/(function isAdmin\(\) \{\s*return signedIn\(\) && request\.auth\.uid == )'[^']*'/, "$1'shano'"),
    },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const db = (uid, email) => env.authenticatedContext(uid, { email: email || uid + '@example.com', email_verified: true }).firestore();
const profile = (over = {}) => ({ name: 'Shano', avatar: 'last-light/ash', over13: true, emailUpdates: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over });
const llData = (over = {}) => ({ runs: 7, deaths: 4, escapes: 2, playtime: 4000, mostRooms: 30, wickLore: 1, met: { wick: 1 },
  endings: { hatch_alone: 1, lift_alone: 1 }, notes: [0, 1, 4], lantern: 'miner', settings: { hints: true }, ...over });
const meta = d => ({ progress: [{ l: 'Endings', h: Object.keys(d.endings).length, t: 18 }, { l: 'Notes', h: d.notes.length, t: 8 }, { l: 'Lanterns', h: 2, t: 6 }],
  totals: { Runs: d.runs, Escapes: d.escapes, Playtime: d.playtime } });
const save = (d = llData(), over = {}) => ({ game: 'last-light', slot: 1, data: d, meta: meta(d), updated: Date.now(), writtenAt: serverTimestamp(), ...over });
async function withProfile(uid) { await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users', uid), { ...profile(), createdAt: Timestamp.fromMillis(Date.now() - 60000), updatedAt: Timestamp.fromMillis(Date.now() - 60000) })); }

// ---------- profiles ----------
test('a player can create their own profile', () => assertSucceeds(setDoc(doc(db('ann'), 'users/ann'), profile())));
test('profile must say 13 or older', () => assertFails(setDoc(doc(db('ann'), 'users/ann'), profile({ over13: false }))));
test('a birth date can never be stored', () => assertFails(setDoc(doc(db('ann'), 'users/ann'), { ...profile(), birthDate: '2010-01' })));
test('name longer than 20 characters is refused', () => assertFails(setDoc(doc(db('ann'), 'users/ann'), profile({ name: 'x'.repeat(21) }))));
test('email updates must be a yes/no', () => assertFails(setDoc(doc(db('ann'), 'users/ann'), profile({ emailUpdates: 'yes' }))));
test('accounts without a confirmed email can do nothing', async () => {
  const unverified = env.authenticatedContext('bot', { email: 'bot@example.com', email_verified: false }).firestore();
  await assertFails(setDoc(doc(unverified, 'users/bot'), profile()));
  await withProfile('bot');
  await assertFails(setDoc(doc(unverified, 'users/bot/saves/last-light-1'), save()));
  await assertFails(getDoc(doc(unverified, 'users/bot')));
});
test("cannot create someone else's profile", () => assertFails(setDoc(doc(db('ann'), 'users/bob'), profile())));
test('signed-out visitors can do nothing', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'users/x'), profile()));
  await withProfile('ann');
  await assertFails(getDoc(doc(anon, 'users/ann')));
});
test("cannot read someone else's profile", async () => { await withProfile('bob'); await assertFails(getDoc(doc(db('ann'), 'users/bob'))); });
test('profile update keeps the sign-up date', async () => {
  await withProfile('ann');
  await assertSucceeds(updateDoc(doc(db('ann'), 'users/ann'), { name: 'Ann', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db('ann'), 'users/ann'), { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }));
});

// ---------- saves ----------
test('a valid save is accepted', async () => { await withProfile('ann'); await assertSucceeds(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save())); });
test('no saves before the age check (no profile)', () => assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save())));
test("cannot write someone else's save", async () => { await withProfile('bob'); await assertFails(setDoc(doc(db('ann'), 'users/bob/saves/last-light-1'), save())); });
test("cannot read someone else's save", async () => {
  await withProfile('bob');
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/bob/saves/last-light-1'), { ...save(), writtenAt: Timestamp.now() }));
  await assertFails(getDoc(doc(db('ann'), 'users/bob/saves/last-light-1')));
});
const cheats = {
  'more endings than escapes': llData({ escapes: 1, endings: { hatch_alone: 1, lift_alone: 1 } }),
  'an ending that does not exist': llData({ endings: { hatch_alone: 1, fake_ending: 1 } }),
  'a note that does not exist': llData({ notes: [0, 9] }),
  'more than 8 notes': llData({ notes: [0, 1, 2, 3, 4, 5, 6, 7, 7] }),
  'more escapes than runs': llData({ runs: 1, escapes: 2, endings: {} }),
  'negative runs': llData({ runs: -1 }),
  'fractional runs': llData({ runs: 1.5 }),
  'more rooms than the map has': llData({ mostRooms: 71 }),
  'an unknown lantern': llData({ lantern: 'golden' }),
  'an extra field': llData({ godMode: true }),
};
for (const [name, d] of Object.entries(cheats)) {
  test('refuses ' + name, async () => { await withProfile('ann'); await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d, { meta: meta({ ...llData(), ...d, endings: d.endings || {}, notes: Array.isArray(d.notes) ? d.notes : [] }) }))); });
}
test('accepts a save with a journal and the seventh lantern', async () => {
  await withProfile('ann');
  const d = llData({ journal: { seen: ['moth', 'listener'], photos: ['moth'] }, lantern: 'keeper' });
  const m = meta(d); m.progress[2] = { l: 'Lanterns', h: 3, t: 7 };
  await assertSucceeds(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d, { meta: m })));
});
test('refuses a journal photo of something never met, or an unknown creature', async () => {
  await withProfile('ann');
  const bad1 = llData({ journal: { seen: ['moth'], photos: ['listener'] } });
  const bad2 = llData({ journal: { seen: ['dragon'], photos: [] } });
  const bad3 = llData({ journal: { seen: [], photos: [], cheats: true } });
  for (const d of [bad1, bad2, bad3]) await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d)));
});
test('accepts a save with diaries and terminal tapes', async () => {
  await withProfile('ann');
  await assertSucceeds(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(llData({ diaries: [0, 4, 20], logs: [0, 7] }))));
});
test('refuses diaries or tapes that do not exist', async () => {
  await withProfile('ann');
  for (const d of [llData({ diaries: [21] }), llData({ logs: [8] }), llData({ diaries: 'all' }), llData({ logs: [0, 1, 2, 3, 4, 5, 6, 7, 7] }), llData({ diaries: [-1] })])
    await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d)));
});
test('refuses progress that does not match the save', async () => {
  await withProfile('ann');
  const d = llData();
  await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d, { meta: { ...meta(d), progress: [{ l: 'Endings', h: 18, t: 18 }, meta(d).progress[1], meta(d).progress[2]] } })));
  await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(d, { meta: { ...meta(d), totals: { Runs: 999, Escapes: 2, Playtime: 4000 } } })));
});
test('refuses a save from the future', async () => { await withProfile('ann'); await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save(llData(), { updated: Date.now() + 3600e3 }))); });
test('refuses a game that has no checks yet', async () => { await withProfile('ann'); await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/other-1'), save(llData(), { game: 'other' }))); });
test('refuses a document id that does not match game and slot', async () => { await withProfile('ann'); await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-2'), save())); });
test('refuses slot 0 or 10', async () => {
  await withProfile('ann');
  await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-0'), save(llData(), { slot: 0 })));
  await assertFails(setDoc(doc(db('ann'), 'users/ann/saves/last-light-10'), save(llData(), { slot: 10 })));
});
test('saves are rate-limited to one write per 5 seconds', async () => {
  await withProfile('ann');
  const ref = doc(db('ann'), 'users/ann/saves/last-light-1');
  await assertSucceeds(setDoc(ref, save()));
  await assertFails(setDoc(ref, save(llData({ runs: 8, deaths: 5 }))));
});
test('a player can delete their own save and profile', async () => {
  await withProfile('ann');
  await setDoc(doc(db('ann'), 'users/ann/saves/last-light-1'), save());
  await assertSucceeds(deleteDoc(doc(db('ann'), 'users/ann/saves/last-light-1')));
  await assertSucceeds(deleteDoc(doc(db('ann'), 'users/ann')));
});

// ---------- admin ----------
test('only the admin can count players and saves', async () => {
  await withProfile('ann');
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/ann/saves/last-light-1'), { ...save(), writtenAt: Timestamp.now() }));
  const admin = db('shano', ADMIN);
  await assertSucceeds(getCountFromServer(collection(admin, 'users')));
  await assertSucceeds(getCountFromServer(query(collectionGroup(admin, 'saves'), where('game', '==', 'last-light'))));
  await assertFails(getCountFromServer(collection(db('ann'), 'users')));
  await assertFails(getCountFromServer(query(collectionGroup(db('ann'), 'saves'), where('game', '==', 'last-light'))));
});
test('admin cannot open a single player\'s profile or save', async () => {
  await withProfile('ann');
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/ann/saves/last-light-1'), { ...save(), writtenAt: Timestamp.now() }));
  await assertFails(getDoc(doc(db('shano', ADMIN), 'users/ann')));
  await assertFails(getDoc(doc(db('shano', ADMIN), 'users/ann/saves/last-light-1')));
});
test('admin is matched by account, not by email', async () => {
  const fake = env.authenticatedContext('eve', { email: ADMIN, email_verified: true }).firestore();
  await assertFails(getCountFromServer(collection(fake, 'users')));
});
