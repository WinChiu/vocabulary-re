import { initialStats, sortCards } from './core.js';
import { mockCards } from './mock.js';
export function callWithTimeout(promise, ms = 5000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Object.assign(
              new Error(
                'The request timed out. Check your connection and retry.',
              ),
              { code: 'timeout' },
            ),
          ),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
export function chunks(items, size = 450) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
// Incremental sync of a cached card list (saves Firestore reads): fetch only
// cards changed since the last sync, and compare a server-side count to catch
// deletions made elsewhere; any mismatch falls back to one full fetch.
export async function syncCards(cached, { fetchAll, fetchSince, count }) {
  let cards;
  if (cached?.cards) {
    const byId = new Map(cached.cards.map((c) => [c.id, c]));
    for (const c of await fetchSince(cached.lastSync || 0)) byId.set(c.id, c);
    if ((await count()) === byId.size) cards = [...byId.values()];
  }
  cards ??= await fetchAll();
  const lastSync = cards.reduce(
    (max, c) => Math.max(max, new Date(c.updated_at || 0).getTime() || 0),
    cached?.lastSync || 0,
  );
  return { cards, lastSync };
}
// JSON round-trip that keeps Date values (cards carry Dates after convert()).
export function packCards(value) {
  if (value instanceof Date) return { $date: value.getTime() };
  if (Array.isArray(value)) return value.map(packCards);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, packCards(v)]),
    );
  return value;
}
export function unpackCards(value) {
  if (Array.isArray(value)) return value.map(unpackCards);
  if (value && typeof value === 'object') {
    if (typeof value.$date === 'number') return new Date(value.$date);
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, unpackCards(v)]),
    );
  }
  return value;
}
export class MockStore {
  constructor() {
    this.collections = { en: mockCards('en'), sv: mockCards('sv') };
    this.failure = null;
  }
  async check() {
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      throw Object.assign(new Error(error), { code: error });
    }
  }
  async list(lang) {
    await this.check();
    return structuredClone(sortCards(this.collections[lang]));
  }
  async save(lang, id, value) {
    await this.check();
    const list = this.collections[lang],
      now = new Date();
    if (id) {
      const c = list.find((c) => c.id === id);
      if (!c) throw new Error('This word no longer exists.');
      Object.assign(c, structuredClone(value), { updated_at: now });
    } else
      list.push({
        ...structuredClone(value),
        id: crypto.randomUUID(),
        review_stats: initialStats(),
        created_at: now,
        updated_at: now,
      });
  }
  async remove(lang, id) {
    await this.check();
    this.collections[lang] = this.collections[lang].filter((c) => c.id !== id);
  }
  async importCards(lang, entries, onProgress = () => {}) {
    for (const group of chunks(entries)) {
      await this.check();
      for (const value of group) {
        if (!this.collections[lang].some((c) => c.id === value.id))
          this.collections[lang].push({
            ...structuredClone(value),
            review_stats: initialStats(),
            created_at: new Date(),
            updated_at: new Date(),
          });
      }
      onProgress(group.length);
    }
  }
  async updateStats(lang, cards) {
    await this.check();
    for (const item of cards) {
      const c = this.collections[lang].find((c) => c.id === item.id);
      if (c) c.review_stats = structuredClone(item.review_stats);
    }
  }
}
