import { normalize, isPhrase, applyResult, sensesOf } from './core.js';
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
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w))
    add(w + w.at(-1) + 'ed', w + w.at(-1) + 'ing');
  return [...result];
}
export function acceptedForms(card, language = 'en') {
  return [
    ...new Set([
      ...forms(card.word_en, language),
      ...(card.forms || []).map(normalize),
    ]),
  ];
}
const tokensOf = (text) => [...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}]+)?/gu)];
export function highlight(example, accepted) {
  const parts = [];
  let last = 0;
  for (const m of tokensOf(example))
    if (accepted.includes(normalize(m[0]))) {
      parts.push([example.slice(last, m.index), false], [m[0], true]);
      last = m.index + m[0].length;
    }
  parts.push([example.slice(last), false]);
  return parts;
}
export function clozeOptions(card, language = 'en') {
  if (isPhrase(card.word_en)) return [];
  const accepted = acceptedForms(card, language);
  return sensesOf(card).flatMap((sense) =>
    sense.example_en.flatMap((example) => {
      const match = tokensOf(example).find((m) =>
        accepted.includes(normalize(m[0])),
      );
      return match
        ? [
            {
              before: example.slice(0, match.index),
              after: example.slice(match.index + match[0].length),
              answer: match[0],
              accepted,
              sense,
            },
          ]
        : [];
    }),
  );
}
export function clozeFor(card, language = 'en', pick = 0) {
  const options = clozeOptions(card, language);
  return options.length
    ? options[Math.min(Math.floor(pick * options.length), options.length - 1)]
    : null;
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
    this.picks = cards.map(() => [random(), random()]);
    this.wrongForm = false;
  }
  get card() {
    return this.cards[this.index];
  }
  get done() {
    return this.index >= this.cards.length;
  }
  get sense() {
    const senses = sensesOf(this.card),
      [pick] = this.picks[this.index];
    return senses[Math.min(Math.floor(pick * senses.length), senses.length - 1)];
  }
  get example() {
    const examples = this.sense.example_en,
      pick = this.picks[this.index][1];
    return examples[Math.min(Math.floor(pick * examples.length), examples.length - 1)] || '';
  }
  get cloze() {
    return clozeFor(this.card, this.language, this.picks[this.index][1]);
  }
  check(answer) {
    const given = normalize(answer),
      cloze = this.mode === 'fill_blank' ? this.cloze : null;
    const pass = cloze
      ? given === normalize(cloze.answer)
      : given === normalize(this.card.word_en);
    this.wrongForm = !!cloze && !pass && cloze.accepted.includes(given);
    if (!pass) this.wrong = true;
    return pass;
  }
  finishCard(pass, now = new Date()) {
    if (this.done) return;
    const recalled = pass && !this.wrong;
    const card = this.card;
    card.review_stats = applyResult(card, recalled, this.mode, now);
    this.results.push({ id: card.id, word: card.word_en, pass: recalled });
    this.index++;
    this.wrong = false;
    this.wrongForm = false;
    this.revealed = false;
  }
}
