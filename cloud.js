// Accounts and cloud saves (Firebase). Loaded only when firebase-config.js has a config.
import { initializeApp } from './vendor/firebase-13.1.0/firebase-app.js';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, connectAuthEmulator,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut as fbSignOut, deleteUser,
} from './vendor/firebase-13.1.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection,
  collectionGroup, query, where, getCount, serverTimestamp, writeBatch, Timestamp,
} from './vendor/firebase-13.1.0/firebase-firestore-lite.js';

let auth, db;
const EMAIL_KEY = 'shanoware.signinEmail';
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

export function start(config) {
  const app = initializeApp(config);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  db = getFirestore(app);
  // Test servers on this computer only; never in the released app.
  if (local && localStorage.getItem('shanoware.dev.emulator') === '1') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
  }
}

// Resolves once with the signed-in user (or null), then calls back on every change.
export function onUser(cb) { return onAuthStateChanged(auth, cb); }
export const currentUser = () => auth.currentUser;

// Friendly words for Firebase error codes.
export function explain(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': "That email address doesn't look right.",
    'auth/missing-email': 'Enter your email address.',
    'auth/too-many-requests': 'Too many tries. Please wait a few minutes and try again.',
    'auth/quota-exceeded': "Shanoware can't send more sign-in emails today. Please try again tomorrow.",
    'auth/network-request-failed': "You're offline or the connection dropped. Check it and try again.",
    'auth/invalid-action-code': 'This sign-in link has expired or was already used. Send yourself a new one.',
    'auth/expired-action-code': 'This sign-in link has expired. Send yourself a new one.',
    'auth/requires-recent-login': 'For safety, sign in again first.',
    'auth/user-disabled': 'This account has been switched off.',
    'permission-denied': 'The server refused that change.',
    'unavailable': "You're offline or the server can't be reached.",
  };
  return map[code] || 'Something went wrong. Please try again.';
}

function appUrl() { const u = new URL(location.href); u.search = ''; u.hash = ''; return u.href; }

export async function sendLink(email) {
  await sendSignInLinkToEmail(auth, email, { url: appUrl(), handleCodeInApp: true });
  localStorage.setItem(EMAIL_KEY, email);
}
export const isLink = () => isSignInWithEmailLink(auth, location.href);
export const rememberedEmail = () => localStorage.getItem(EMAIL_KEY);
export async function finishLink(email) {
  const href = location.href;
  history.replaceState(null, '', appUrl()); // the link only works once; don't leave it in the address bar
  const cred = await signInWithEmailLink(auth, email, href);
  localStorage.removeItem(EMAIL_KEY);
  return cred.user;
}
export const signOut = () => fbSignOut(auth);

// ---------- profile: users/{uid} ----------
const me = () => doc(db, 'users', auth.currentUser.uid);
export async function getProfile() { const s = await getDoc(me()); return s.exists() ? s.data() : null; }
export function createProfile({ name, avatar, emailUpdates }) {
  return setDoc(me(), { name: name || '', avatar: avatar || '', over13: true, emailUpdates: !!emailUpdates, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export function updateProfile(fields) { return updateDoc(me(), { ...fields, updatedAt: serverTimestamp() }); }

// ---------- saves: users/{uid}/saves/{game}-{slot} ----------
const savesCol = () => collection(db, 'users', auth.currentUser.uid, 'saves');
export async function listSaves() {
  const out = new Map();
  (await getDocs(savesCol())).forEach(d => out.set(d.id, d.data()));
  return out;
}
export function putSave(game, slot, data, meta, updated) {
  return setDoc(doc(savesCol(), `${game}-${slot}`), { game, slot, data, meta, updated, writtenAt: serverTimestamp() });
}
export const removeSave = (game, slot) => deleteDoc(doc(savesCol(), `${game}-${slot}`));

// ---------- account ----------
export function recentlySignedIn() {
  const t = Date.parse(auth.currentUser?.metadata?.lastSignInTime || '');
  return Date.now() - t < 4 * 60 * 1000; // Firebase asks for a fresh sign-in after about 5 minutes
}
export async function deleteAccount() {
  const batch = writeBatch(db);
  (await getDocs(savesCol())).forEach(d => batch.delete(d.ref));
  batch.delete(me());
  await batch.commit();
  await deleteUser(auth.currentUser);
}
// Used when someone under 13 tries to sign up: the sign-in account is removed straight away.
export const removeSignInAccount = () => deleteUser(auth.currentUser);

export async function exportAll() {
  const saves = {};
  (await listSaves()).forEach((v, k) => { saves[k] = { ...v, writtenAt: v.writtenAt?.toDate?.().toISOString() }; });
  const p = await getProfile();
  if (p) for (const k of ['createdAt', 'updatedAt']) p[k] = p[k]?.toDate?.().toISOString();
  return { email: auth.currentUser.email, profile: p, saves };
}

// ---------- admin page ----------
export async function adminCounts(gameIds) {
  const users = collection(db, 'users');
  const since = days => Timestamp.fromMillis(Date.now() - days * 864e5);
  const n = async q => (await getCount(q)).data().count;
  const [players, week, month, emails] = await Promise.all([
    n(users), n(query(users, where('createdAt', '>=', since(7)))), n(query(users, where('createdAt', '>=', since(30)))),
    n(query(users, where('emailUpdates', '==', true))),
  ]);
  const games = {};
  for (const id of gameIds) games[id] = await n(query(collectionGroup(db, 'saves'), where('game', '==', id)));
  return { players, week, month, emails, games };
}
