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
