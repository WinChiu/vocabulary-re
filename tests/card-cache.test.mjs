import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadCards, tsMillis, cachePath } from '../scripts/card-cache.mjs';

const ts = (ms) => ({ _seconds: Math.floor(ms / 1000), _nanoseconds: (ms % 1000) * 1e6 });

// Minimal stand-in for a firebase-admin CollectionReference that counts billed reads.
function fakeCollection(docs) {
  const calls = { full: 0, where: 0, count: 0, reads: 0 };
  const snap = (list) => ({ docs: list.map(([id, data]) => ({ id, data: () => data })) });
  const ref = {
    calls,
    docs,
    get: async () => {
      calls.full++;
      calls.reads += docs.size;
      return snap([...docs]);
    },
    where(field, op, value) {
      assert.equal(field, 'updated_at');
      assert.equal(op, '>=');
      return {
        get: async () => {
          calls.where++;
          const hits = [...docs].filter(([, d]) => tsMillis(d.updated_at) >= value.getTime());
          calls.reads += Math.max(hits.length, 1);
          return snap(hits);
        },
      };
    },
    count: () => ({
      get: async () => {
        calls.count++;
        calls.reads += 1;
        return { data: () => ({ count: docs.size }) };
      },
    }),
  };
  return ref;
}

function seed(n) {
  return new Map(
    Array.from({ length: n }, (_, i) => [`id${i}`, { word_en: `word${i}`, meaning_zh: '字', updated_at: ts(1000 + i) }]),
  );
}

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'card-cache-'));

test('first load does one full read and writes the cache', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(50));
  const store = await loadCards('en', () => ref, { cacheDir: dir });
  assert.equal(store.cards.length, 50);
  assert.equal(store.sync.mode, 'full');
  assert.equal(ref.calls.full, 1);
  const cached = JSON.parse(readFileSync(cachePath('en', dir), 'utf8'));
  assert.equal(cached.cards.length, 50);
  assert.equal(cached.last_sync, 1049);
});

test('second load is incremental: no full read, only changed docs', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(500));
  await loadCards('en', () => ref, { cacheDir: dir });
  ref.calls.reads = 0;
  ref.docs.set('id3', { word_en: 'changed', meaning_zh: '改', updated_at: ts(9000) });
  ref.docs.set('new', { word_en: 'brand new', meaning_zh: '新', updated_at: ts(9001) });

  const store = await loadCards('en', () => ref, { cacheDir: dir });
  assert.equal(ref.calls.full, 1, 'no extra full read');
  assert.equal(store.sync.mode, 'incremental');
  assert.equal(store.cards.length, 501);
  assert.equal(store.get('id3').word_en, 'changed');
  assert.ok(ref.calls.reads < 10, `expected a handful of reads, got ${ref.calls.reads}`);
});

test('a deletion elsewhere is caught by count() and forces a full refresh', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(20));
  await loadCards('en', () => ref, { cacheDir: dir });
  ref.docs.delete('id5');
  const store = await loadCards('en', () => ref, { cacheDir: dir });
  assert.equal(store.sync.mode, 'full');
  assert.equal(store.sync.reason, 'count-mismatch');
  assert.equal(store.get('id5'), undefined);
  assert.equal(store.cards.length, 19);
});

test('offline makes zero Firestore calls and never builds the collection', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(10));
  await loadCards('en', () => ref, { cacheDir: dir });
  const store = await loadCards(
    'en',
    () => {
      throw new Error('must not touch Firestore');
    },
    { cacheDir: dir, offline: true },
  );
  assert.equal(store.cards.length, 10);
  assert.deepEqual(store.sync, { mode: 'offline', reads: 0 });
});

test('offline without a cache errors clearly', async () => {
  await assert.rejects(
    loadCards('sv', () => null, { cacheDir: tmp(), offline: true }),
    /No local cache/,
  );
});

test('refresh ignores the cache and does a full read', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(5));
  await loadCards('en', () => ref, { cacheDir: dir });
  const store = await loadCards('en', () => ref, { cacheDir: dir, refresh: true });
  assert.equal(ref.calls.full, 2);
  assert.equal(store.sync.reason, 'refresh');
});

test('local writes are mirrored into the cache', async () => {
  const dir = tmp();
  const ref = fakeCollection(seed(3));
  const store = await loadCards('en', () => ref, { cacheDir: dir });
  store.upsert({ id: 'added', word_en: 'added', meaning_zh: '加' });
  store.upsert({ id: 'id0', category: 'verbs' });
  store.remove('id1');
  store.save();
  const offline = await loadCards('en', () => null, { cacheDir: dir, offline: true });
  assert.equal(offline.get('added').word_en, 'added');
  assert.equal(offline.get('id0').category, 'verbs');
  assert.equal(offline.get('id0').word_en, 'word0', 'upsert merges, not replaces');
  assert.equal(offline.get('id1'), undefined);
  assert.ok(existsSync(cachePath('en', dir)));
});

test('tsMillis handles Timestamp-like, JSON and Date forms', () => {
  assert.equal(tsMillis({ toMillis: () => 42 }), 42);
  assert.equal(tsMillis(ts(1234)), 1234);
  assert.equal(tsMillis(new Date(7)), 7);
  assert.equal(tsMillis(undefined), 0);
});
