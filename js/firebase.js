import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { app, db } from './firebase-config.js';
import { LANGUAGES, initialStats, sortCards } from './core.js';
import { callWithTimeout, chunks, syncCards, packCards, unpackCards } from './data.js';
import { GOOGLE_CLIENT_ID, loadGoogleIdentity, createGoogleLogin } from './google-login.js';
const auth = getAuth(app);
let googleLogin;
export async function initializeAuth(callback) {
  await callWithTimeout(setPersistence(auth, browserLocalPersistence));
  return onAuthStateChanged(auth, callback);
}
export async function prepareLogin() {
  if (googleLogin) return;
  const oauth2 = await loadGoogleIdentity();
  googleLogin = createGoogleLogin({
    oauth2,
    clientId: GOOGLE_CLIENT_ID,
    exchangeCredential: accessToken => signInWithCredential(auth, GoogleAuthProvider.credential(null, accessToken)),
  });
}
export function login() {
  if (!googleLogin) return Promise.reject(Object.assign(new Error('Sign-in is loading. Please try again in a moment.'), {code:'auth/not-ready'}));
  return googleLogin();
}
// Per-user card cache in localStorage, so reloading the library only reads
// cards that changed instead of the whole collection. Best-effort: any storage
// failure just means a full fetch.
const CACHE_PREFIX = 'jw-cards:';
const cacheKey = (lang) => `${CACHE_PREFIX}${auth.currentUser?.uid || 'anon'}:${lang}`;
function readCache(lang) {
  try {
    const raw = localStorage.getItem(cacheKey(lang));
    return raw ? unpackCards(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
function writeCache(lang, value) {
  try {
    localStorage.setItem(cacheKey(lang), JSON.stringify(packCards(value)));
  } catch {
    try {
      localStorage.removeItem(cacheKey(lang));
    } catch {}
  }
}
function clearCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
export const logout = () => {
  clearCaches();
  return signOut(auth);
};
function convert(value) {
  if (value?.toDate) return value.toDate();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, convert(v)]),
    );
  return value;
}
export class FirebaseStore {
  ref(lang, id) {
    return id
      ? doc(db, LANGUAGES[lang].collection, id)
      : collection(db, LANGUAGES[lang].collection);
  }
  async list(lang) {
    const ref = this.ref(lang);
    const toCards = (data) =>
      data.docs.map((d) => ({ ...convert(d.data()), id: d.id }));
    const synced = await syncCards(readCache(lang), {
      fetchAll: async () => toCards(await callWithTimeout(getDocs(ref))),
      fetchSince: async (ms) =>
        toCards(
          await callWithTimeout(
            getDocs(query(ref, where('updated_at', '>=', new Date(ms)))),
          ),
        ),
      count: async () =>
        (await callWithTimeout(getCountFromServer(ref))).data().count,
    });
    writeCache(lang, synced);
    return sortCards(synced.cards);
  }
  async save(lang, id, value) {
    if (id)
      return callWithTimeout(
        updateDoc(this.ref(lang, id), {
          ...value,
          updated_at: serverTimestamp(),
        }),
      );
    return callWithTimeout(
      setDoc(doc(this.ref(lang)), {
        ...value,
        review_stats: initialStats(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }),
    );
  }
  async remove(lang, id) {
    await callWithTimeout(deleteDoc(this.ref(lang, id)));
    // Drop it locally too, or the next sync's count check would force a full fetch.
    const cached = readCache(lang);
    if (cached?.cards)
      writeCache(lang, { ...cached, cards: cached.cards.filter((c) => c.id !== id) });
  }
  async importCards(lang, entries, onProgress = () => {}) {
    for (const group of chunks(entries)) {
      const batch = writeBatch(db);
      for (const { id, ...value } of group)
        batch.set(this.ref(lang, id), {
          ...value,
          review_stats: initialStats(),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      await callWithTimeout(batch.commit(), 20000);
      onProgress(group.length);
    }
  }
  async updateStats(lang, cards) {
    for (const group of chunks(cards)) {
      const batch = writeBatch(db);
      group.forEach((c) =>
        batch.update(this.ref(lang, c.id), {
          review_stats: c.review_stats,
          updated_at: serverTimestamp(),
        }),
      );
      await callWithTimeout(batch.commit(), 15000);
    }
  }
}
