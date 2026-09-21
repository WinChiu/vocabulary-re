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
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { app, db } from './firebase-config.js';
import { LANGUAGES, initialStats, sortCards } from './core.js';
import { callWithTimeout, chunks } from './data.js';
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
export const logout = () => signOut(auth);
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
    const data = await callWithTimeout(getDocs(this.ref(lang)));
    return sortCards(
      data.docs.map((d) => ({ ...convert(d.data()), id: d.id })),
    );
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
  remove(lang, id) {
    return callWithTimeout(deleteDoc(this.ref(lang, id)));
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
