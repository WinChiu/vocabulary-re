import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCard, sensesOf, filterCards, initialStats } from '../js/core.js';
import { clozeFor, clozeOptions, ReviewSession, forms, highlight } from '../js/review.js';
import { prepareImport } from '../js/import.js';
import * as views from '../js/views.js';
const card = (o = {}) => ({ id: '1', word_en: 'wander', meaning_zh: '漫步', category: '', note: '', example_en: ['We wander.'], created_at: new Date(2026, 8, 20), review_stats: initialStats(), ...o });
const taboo = card({
  id: 't', word_en: 'taboo', forms: ['tabooed'],
  senses: [
    { pos: 'n.', meaning_zh: '禁忌', example_en: ['Salary is a taboo.'] },
    { pos: 'adj.', meaning_zh: '禁忌的', example_en: ['A taboo subject.'] },
    { pos: 'v.', meaning_zh: '列為禁忌', example_en: ['It was tabooed.'] },
  ],
});
test('legacy cards read as one unlabelled sense', () => {
  assert.deepEqual(sensesOf(card()), [{ pos: '', meaning_zh: '漫步', example_en: ['We wander.'] }]);
});
test('validateCard normalizes senses, forms and derived legacy fields', () => {
  const { value, error } = validateCard({ ...taboo, forms: 'Taboos, taboo, tabooed', related: ['taboo'], senses: [...taboo.senses, { pos: '', meaning_zh: '', example_en: [''] }] });
  assert.equal(error, '');
  assert.equal(value.senses.length, 3);
  assert.deepEqual(value.forms, ['Taboos', 'tabooed']);
  assert.deepEqual(value.related, []);
  assert.equal(value.meaning_zh, 'n. 禁忌 / adj. 禁忌的 / v. 列為禁忌');
  assert.deepEqual(value.example_en, ['Salary is a taboo.', 'A taboo subject.', 'It was tabooed.']);
  assert.equal(validateCard({ ...taboo, senses: [{ pos: 'bogus', meaning_zh: 'x', example_en: ['x'] }] }).value.senses[0].pos, '');
});
test('each sense needs a meaning and examples', () => {
  assert.match(validateCard({ word_en: 'x', senses: [{ pos: 'n.', meaning_zh: 'a', example_en: ['x'] }, { pos: 'v.', meaning_zh: '', example_en: ['y'] }] }).error, /required/);
  assert.match(validateCard({ word_en: 'x', senses: [{ pos: 'n.', meaning_zh: 'a', example_en: ['x'] }, { pos: 'v.', meaning_zh: 'b', example_en: [] }] }).error, /1 and 5/);
});
test('duplicate check covers forms both ways', () => {
  const propel = card({ id: 'p', word_en: 'propel', forms: ['propelled'] });
  assert.match(validateCard(card({ id: 'n', word_en: 'propelled' }), [propel]).error, /under "propel"/);
  assert.match(validateCard(card({ id: 'n', word_en: 'push', forms: ['propel'] }), [propel]).error, /under "propel"/);
  assert.match(validateCard(card({ id: 'n', word_en: 'PROPEL' }), [propel]).error, /already exists/);
  assert.equal(validateCard(propel, [propel], 'p').error, '');
});
test('library search finds a word by its forms', () => {
  assert.equal(filterCards([taboo], { search: 'TABOOED' }).length, 1);
});
test('multi-syllable consonant doubling and manual forms feed cloze', () => {
  assert.ok(forms('propel').includes('propelled'));
  assert.equal(clozeFor(card({ word_en: 'seek', example_en: ['She sought help.'] })), null);
  assert.equal(clozeFor(card({ word_en: 'seek', forms: ['sought'], example_en: ['She sought help.'] })).answer, 'sought');
});
test('cloze options span every sense and pick is random', () => {
  const options = clozeOptions(taboo);
  assert.equal(options.length, 3);
  assert.deepEqual(options.map((o) => o.sense.pos), ['n.', 'adj.', 'v.']);
  assert.equal(clozeFor(taboo, 'en', 0).answer, 'taboo');
  assert.equal(clozeFor(taboo, 'en', 0.99).answer, 'tabooed');
});
test('cloze requires the exact form; other forms are flagged', () => {
  const r = new ReviewSession([taboo], 'fill_blank', 'en', () => 0.99);
  assert.equal(r.cloze.answer, 'tabooed');
  assert.equal(r.check('taboo'), false);
  assert.equal(r.wrongForm, true);
  assert.equal(r.check('nonsense'), false);
  assert.equal(r.wrongForm, false);
  assert.equal(r.check(' Tabooed '), true);
  r.finishCard(true);
  assert.equal(r.results[0].pass, false);
});
test('session picks a sense for prompts', () => {
  const r = new ReviewSession([taboo], 'spelling', 'en', () => 0.5);
  assert.equal(r.sense.pos, 'adj.');
  assert.equal(r.example, 'A taboo subject.');
});
test('highlight marks every accepted form', () => {
  assert.deepEqual(highlight('Taboo, tabooed.', ['taboo', 'tabooed']).filter(([, hit]) => hit).map(([t]) => t), ['Taboo', 'tabooed']);
});
test('views render senses, forms and related safely', () => {
  const html = views.previewView({ language: 'en' }, { ...taboo, related: ['<b>x</b>'] });
  assert.ok(html.includes('<span class="pos">adj.</span>'));
  assert.ok(html.includes('<mark>tabooed</mark>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  const row = views.libraryView({ cards: [], filters: { type: 'word', status: 'ALL', category: 'ALL', search: '' } }, [taboo]);
  assert.ok(row.includes('+1'));
  assert.ok(!row.includes('tabooed'));
});
test('CSV accepts pos and forms columns and dedupes by form', () => {
  const p = prepareImport([['word', 'pos', 'meaning', 'forms', 'example'], ['propel', 'v.', '推動', 'propelled; propels', 'It propelled us.'], ['propelled', '', '推動', '', 'Propelled.']]);
  assert.equal(p.valid.length, 1);
  assert.equal(p.duplicates, 1);
  assert.equal(p.valid[0].senses[0].pos, 'v.');
  assert.deepEqual(p.valid[0].forms, ['propelled', 'propels']);
});
test('cloze matches hyphenated compounds whole and plain words inside them', () => {
  assert.equal(clozeFor(card({ word_en: 'top-notch', example_en: ['The service is top-notch.'] })).answer, 'top-notch');
  assert.equal(clozeFor(card({ word_en: 'vis-à-vis', example_en: ['We compared it vis-à-vis the old plan.'] })).answer, 'vis-à-vis');
  assert.equal(clozeFor(card({ word_en: 'known', example_en: ['A well-known author.'] })).answer, 'known');
  assert.equal(clozeFor(card({ word_en: 'notch', example_en: ['The service is top-notch.'] })).answer, 'notch');
  assert.deepEqual(highlight('A top-notch, top-notch day.', ['top-notch']).filter(([, hit]) => hit).length, 2);
});
test('inflection tables are validated, feed matching, and render labelled', async () => {
  const { inflectedForms, wordsOf } = await import('../js/core.js');
  const raw = card({ word_en: 'dricka', senses: [{ pos: 'v.', meaning_zh: '喝', example_en: ['Vi drack te i går.'] }],
    inflection: { 'v.': { present: 'dricker', past: 'drack', supine: 'druckit', bogus: 'x' }, 'n.': { gender: 'en', plural: 'drickor' } } });
  const { value, error } = validateCard(raw);
  assert.equal(error, '');
  assert.deepEqual(value.inflection, { 'v.': { present: 'dricker', past: 'drack', supine: 'druckit' } });
  assert.deepEqual(inflectedForms({ inflection: { 'v.': { past: 'sa/sade' }, 'n.': { gender: 'ett' } } }), ['sa', 'sade']);
  assert.equal(clozeFor(value, 'sv').answer, 'drack');
  assert.ok(wordsOf(value).includes('druckit'));
  assert.equal(validateCard(card({ id: 'x', word_en: 'drack' }), [{ ...value, id: 'd' }]).error.includes('under "dricka"'), true);
  const noun = validateCard({ word_en: 'artikel', senses: [{ pos: 'n.', meaning_zh: '文章', example_en: ['Artikeln handlar om mat.'] }], inflection: { 'n.': { gender: 'en', definite: 'artikeln', plural: 'artiklar' } } }).value;
  const html = views.previewView({ language: 'sv' }, { ...noun, id: 'a', review_stats: initialStats() });
  assert.ok(html.includes('<dt>Gender</dt><dd>en</dd>'));
  assert.ok(html.includes('<dt>Plural</dt><dd>artiklar</dd>'));
  assert.ok(html.includes('<mark>Artikeln</mark>'));
  assert.equal(validateCard({ ...noun, inflection: { 'n.': { gender: 'den' } } }).value.inflection['n.'], undefined);
});
