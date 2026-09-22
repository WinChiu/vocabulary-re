import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCards, packCards, unpackCards } from '../js/data.js';

const card = (id, ms, extra = {}) => ({ id, word_en: id, updated_at: new Date(ms), ...extra });

function source(cards) {
  const calls = { all: 0, since: [], count: 0 };
  return {
    calls,
    cards,
    fetchAll: async () => (calls.all++, [...cards.values()]),
    fetchSince: async (ms) => (
      calls.since.push(ms), [...cards.values()].filter((c) => c.updated_at.getTime() >= ms)
    ),
    count: async () => (calls.count++, cards.size),
  };
}

test('no cache: one full fetch, lastSync is the newest updated_at', async () => {
  const src = source(new Map([['a', card('a', 10)], ['b', card('b', 30)]]));
  const out = await syncCards(null, src);
  assert.equal(src.calls.all, 1);
  assert.equal(src.calls.count, 0);
  assert.equal(out.cards.length, 2);
  assert.equal(out.lastSync, 30);
});

test('cache: only changed cards are fetched and merged', async () => {
  const src = source(new Map([['a', card('a', 10)], ['b', card('b', 30)]]));
  const first = await syncCards(null, src);
  src.cards.set('b', card('b', 50, { word_en: 'edited' }));
  src.cards.set('c', card('c', 60));
  const out = await syncCards(first, src);
  assert.equal(src.calls.all, 1, 'no second full fetch');
  assert.deepEqual(src.calls.since, [30]);
  assert.equal(out.cards.length, 3);
  assert.equal(out.cards.find((c) => c.id === 'b').word_en, 'edited');
  assert.equal(out.lastSync, 60);
});

test('cache: a deletion elsewhere is caught by count and forces a full fetch', async () => {
  const src = source(new Map([['a', card('a', 10)], ['b', card('b', 30)]]));
  const first = await syncCards(null, src);
  src.cards.delete('a');
  const out = await syncCards(first, src);
  assert.equal(src.calls.all, 2);
  assert.deepEqual(out.cards.map((c) => c.id), ['b']);
});

test('pack/unpack keeps Dates (including nested review stats) through JSON', () => {
  const value = { lastSync: 5, cards: [card('a', 10, { review_stats: { next_review_at: new Date(99) } })] };
  const back = unpackCards(JSON.parse(JSON.stringify(packCards(value))));
  assert.ok(back.cards[0].updated_at instanceof Date);
  assert.equal(back.cards[0].review_stats.next_review_at.getTime(), 99);
  assert.deepEqual(back, value);
});
