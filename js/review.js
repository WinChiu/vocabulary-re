import { normalize, isPhrase, applyResult } from './core.js';
const irregular = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  go: ['goes', 'went', 'gone', 'going'],
  take: ['takes', 'took', 'taken', 'taking'],
  make: ['makes', 'made', 'making'],
  run: ['runs', 'ran', 'running'],
  write: ['writes', 'wrote', 'written', 'writing'],
  read: ['reads', 'reading'],
  think: ['thinks', 'thought', 'thinking'],
  find: ['finds', 'found', 'finding'],
  have: ['has', 'had', 'having'],
  get: ['gets', 'got', 'gotten', 'getting'],
  see: ['sees', 'saw', 'seen', 'seeing'],
  do: ['does', 'did', 'done', 'doing'],
};
export function forms(word, language = 'en') {
  const w = normalize(word);
  const result = new Set([w]);
  if (language !== 'en') return [...result];
  if (irregular[w]) return [...result, ...irregular[w]];
  const add = (...values) => values.forEach((v) => result.add(v));
  if (/[^aeiou]y$/.test(w))
    add(w.slice(0, -1) + 'ies', w.slice(0, -1) + 'ied', w + 'ing');
  else {
    add(w + (/(?:s|x|z|ch|sh|o)$/.test(w) ? 'es' : 's'));
    add(w + (w.endsWith('e') ? 'd' : 'ed'));
    add(
      w.endsWith('e') && !w.endsWith('ee') ? w.slice(0, -1) + 'ing' : w + 'ing',
    );
  }
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w))
    add(w + w.at(-1) + 'ed', w + w.at(-1) + 'ing');
  return [...result];
}
export function clozeFor(card, language = 'en') {
  if (isPhrase(card.word_en)) return null;
  const accepted = forms(card.word_en, language);
  for (const example of card.example_en || []) {
    const tokens = [...example.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}]+)?/gu)];
    const match = tokens.find((m) => accepted.includes(normalize(m[0])));
    if (match)
      return {
        before: example.slice(0, match.index),
        after: example.slice(match.index + match[0].length),
        answer: match[0],
        accepted,
      };
  }
  return null;
}
export class ReviewSession {
  constructor(cards, mode, language = 'en', random = Math.random) {
    this.cards = structuredClone(cards);
    this.mode = mode;
    this.language = language;
    this.index = 0;
    this.results = [];
    this.wrong = false;
    this.revealed = false;
    this.exampleIndex = cards.map((c) =>
      Math.floor(random() * (c.example_en?.length || 1)),
    );
  }
  get card() {
    return this.cards[this.index];
  }
  get done() {
    return this.index >= this.cards.length;
  }
  get example() {
    return this.card.example_en[this.exampleIndex[this.index]] || '';
  }
  check(answer) {
    const pass =
      this.mode === 'fill_blank'
        ? clozeFor(this.card, this.language)?.accepted.includes(
            normalize(answer),
          )
        : normalize(answer) === normalize(this.card.word_en);
    if (!pass) this.wrong = true;
    return !!pass;
  }
  finishCard(pass, now = new Date()) {
    if (this.done) return;
    const recalled = pass && !this.wrong;
    const card = this.card;
    card.review_stats = applyResult(card, recalled, this.mode, now);
    this.results.push({ id: card.id, word: card.word_en, pass: recalled });
    this.index++;
    this.wrong = false;
    this.revealed = false;
  }
}
