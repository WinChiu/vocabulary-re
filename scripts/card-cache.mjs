// Local cache of a Firestore card collection, so the skill CLI doesn't have to
// read the whole collection (N billed reads) on every command.
//
// Sync strategy:
//   - no cache / --refresh  -> one full read
//   - cache present         -> read only docs with updated_at >= lastSync, merge,
//                              then a count() aggregation (1 read per 1000 docs)
//                              to detect deletions; a mismatch forces a full read
//   - offline               -> cache only, zero Firestore calls
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CACHE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'backups',
);

// Timestamps are stored as their JSON form ({_seconds,_nanoseconds}); accept
// live Timestamp objects, that JSON form, and plain Dates.
export function tsMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const seconds = value._seconds ?? value.seconds;
  const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
  return typeof seconds === 'number' ? seconds * 1000 + Math.floor(nanos / 1e6) : 0;
}

function toCard(doc) {
  return JSON.parse(JSON.stringify({ id: doc.id, ...doc.data() }));
}

export function cachePath(lang, cacheDir = DEFAULT_CACHE_DIR) {
  return path.join(cacheDir, `cache-${lang}.json`);
}

function readCache(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export class CardStore {
  constructor(lang, cards, lastSync, file, sync) {
    this.lang = lang;
    this.map = new Map(cards.map((c) => [c.id, c]));
    this.lastSync = lastSync;
    this.file = file;
    this.sync = sync;
  }
  get cards() {
    return [...this.map.values()];
  }
  get(id) {
    return this.map.get(id);
  }
  // Local mirror of a write this script just made. updated_at is left as-is:
  // the server timestamp is newer than lastSync, so the next sync re-fetches it.
  upsert(card) {
    this.map.set(card.id, JSON.parse(JSON.stringify({ ...this.map.get(card.id), ...card })));
  }
  remove(id) {
    this.map.delete(id);
  }
  save() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(
      this.file,
      JSON.stringify({
        language: this.lang,
        last_sync: this.lastSync,
        saved_at: new Date().toISOString(),
        cards: this.cards,
      }),
      'utf8',
    );
  }
}

// getCollection is lazy so offline mode never touches credentials or Firestore.
export async function loadCards(lang, getCollection, { offline = false, refresh = false, cacheDir } = {}) {
  const file = cachePath(lang, cacheDir);
  const cached = refresh ? null : readCache(file);

  if (offline) {
    if (!cached)
      throw new Error(`No local cache for "${lang}" at "${file}". Run once without --offline to create it.`);
    return new CardStore(lang, cached.cards, cached.last_sync, file, { mode: 'offline', reads: 0 });
  }

  const collectionRef = getCollection();
  const full = async (reason) => {
    const snapshot = await collectionRef.get();
    const cards = snapshot.docs.map(toCard);
    return { cards, reads: Math.max(cards.length, 1), reason };
  };

  let result;
  if (!cached) {
    result = await full(refresh ? 'refresh' : 'no-cache');
    result.mode = 'full';
  } else {
    const since = new Date(cached.last_sync || 0);
    const changed = await collectionRef.where('updated_at', '>=', since).get();
    const map = new Map(cached.cards.map((c) => [c.id, c]));
    for (const doc of changed.docs) map.set(doc.id, toCard(doc));
    const countSnap = await collectionRef.count().get();
    const count = countSnap.data().count;
    const countReads = Math.max(1, Math.ceil(count / 1000));
    if (count !== map.size) {
      result = await full('count-mismatch');
      result.mode = 'full';
      result.reads += Math.max(changed.docs.length, 1) + countReads;
    } else {
      result = {
        mode: 'incremental',
        cards: [...map.values()],
        reads: Math.max(changed.docs.length, 1) + countReads,
        changed: changed.docs.length,
      };
    }
  }

  const lastSync = Math.max(cached?.last_sync || 0, ...result.cards.map((c) => tsMillis(c.updated_at)));
  const { cards, ...sync } = result;
  const store = new CardStore(lang, cards, lastSync, file, sync);
  store.save();
  return store;
}
